'use strict';

const { EventEmitter } = require('node:events');

const DEFAULT_RING_BUFFER_SIZE = 200;

/**
 * Parse an ISO 8601 string that has an explicit UTC offset (Z or ±HH:MM / ±HHMM).
 * Returns the numeric UTC timestamp in ms, or NaN if:
 *   - input is null/undefined/empty
 *   - string is timezone-naive (no Z / offset)
 *   - Date.parse fails (Invalid Date)
 *
 * @param {string|null|undefined} s
 * @returns {number}
 */
function parseIsoUtcMs(s) {
  if (!s || typeof s !== 'string') return NaN;
  // Require explicit UTC marker: Z, +HH:MM, -HH:MM, +HHMM, -HHMM
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return NaN;
  const ms = Date.parse(s);
  return ms; // NaN if unparseable
}

/**
 * Simple fixed-capacity ring buffer backed by an Array.
 * Oldest item is evicted when capacity is exceeded.
 */
class RingBuffer {
  constructor(size) {
    this._size = size;
    this._buf = [];
  }

  push(item) {
    if (this._buf.length >= this._size) {
      this._buf.shift(); // evict oldest
    }
    this._buf.push(item);
  }

  toArray() {
    return this._buf.slice();
  }

  get length() {
    return this._buf.length;
  }
}

/**
 * Create an in-memory worktree state store.
 * This is the swap point: Phase 2 can replace this factory with SQLite.
 *
 * @param {{ ringBufferSize?: number }} [opts]
 * @returns {Store}
 */
function createStore(opts = {}) {
  const ringBufferSize = opts.ringBufferSize ?? DEFAULT_RING_BUFFER_SIZE;

  /** @type {Map<string, { state: object, activity: RingBuffer }>} */
  const _map = new Map();
  const _emitter = new EventEmitter();

  function _getOrCreate(wPath) {
    if (!_map.has(wPath)) {
      _map.set(wPath, {
        state: {
          path: wPath, branch: null, taskId: null,
          cachedIssue: null, lastFetchedAt: null, noContext: false,
          // ring buffer 밖에 별도 보존되는 신호. PreToolUse/PostToolUse가 폭주해
          // ring buffer가 가득 차도 prompt/response 신호가 사라지지 않도록 함.
          lastPromptEvent: null,
          lastStopEvent: null,
          // AC-5: jira-collector가 workspace별 credentials 상태를 기록.
          // null = 아직 평가 안 됨, 'ok' = 정상, 'missing' = CredentialsNotFoundError
          credsStatus: null,
        },
        activity: new RingBuffer(ringBufferSize),
      });
    }
    return _map.get(wPath);
  }

  /**
   * Serialize a record for external consumption.
   * activity is truncated to last 50 items in snapshots.
   */
  function _serialize(record, { truncateActivity = false } = {}) {
    const { state, activity } = record;
    const acts = truncateActivity ? activity.toArray().slice(-50) : activity.toArray();
    return { ...state, activity: acts };
  }

  return {
    /**
     * Insert or update a worktree entry. Emits 'worktree.added' or 'worktree.changed'.
     *
     * cachedIssue 보호: fetchedAt 비교 기반.
     *   - incoming cachedIssue가 null  → 통과 (명시적 clear, U7c).
     *   - 한쪽이라도 fetchedAt 없음    → 기존 보존 또는 cold-start fill (U7/U7b).
     *   - 둘 다 있고 incoming이 더 최신  → 교체 (stale-lock 해소).
     *   - 같거나 오래됨 / NaN         → 기존 보존 (U7 회귀 안전망).
     *
     * @param {Partial<WorktreeState> & { path: string }} update
     */
    upsertWorktree(update) {
      const isNew = !_map.has(update.path);
      const record = _getOrCreate(update.path);
      const merged = { ...update };
      if ('cachedIssue' in merged && merged.cachedIssue !== null && record.state.cachedIssue) {
        // 둘 다 truthy → fetchedAt 비교
        const incomingMs = parseIsoUtcMs(merged.cachedIssue.fetchedAt);
        const existingMs = parseIsoUtcMs(record.state.cachedIssue.fetchedAt);
        if (!(incomingMs > existingMs)) {
          // 같거나 오래됨 / NaN → 기존 보존
          delete merged.cachedIssue;
        }
      }
      Object.assign(record.state, merged);
      const eventName = isNew ? 'worktree.added' : 'worktree.changed';
      _emitter.emit(eventName, { path: update.path, state: _serialize(record) });
    },

    /**
     * Remove a worktree. Emits 'worktree.removed'. No-op if not found.
     * @param {string} wPath
     */
    removeWorktree(wPath) {
      if (!_map.has(wPath)) return; // no-op
      _map.delete(wPath);
      _emitter.emit('worktree.removed', { path: wPath });
    },

    /**
     * Update the cachedIssue for a worktree. Sets lastFetchedAt to now.
     * @param {string} wPath
     * @param {object} issue
     */
    updateCachedIssue(wPath, issue) {
      const record = _getOrCreate(wPath);
      record.state.cachedIssue = issue;
      record.state.lastFetchedAt = new Date().toISOString();
      _emitter.emit('worktree.changed', { path: wPath, state: _serialize(record) });
    },

    /**
     * Push an activity event into the ring buffer for a worktree.
     * Auto-creates the worktree entry if it doesn't exist (with warn).
     * @param {string} wPath
     * @param {{ ts: string, type: string, data: object }} ev
     */
    pushActivity(wPath, ev) {
      const record = _getOrCreate(wPath);
      record.activity.push(ev);
      // 핵심 신호는 ring buffer 외에 별도 필드에도 보존(eviction 방지).
      if (ev?.type === 'UserPromptSubmit') {
        record.state.lastPromptEvent = ev;
      } else if (ev?.type === 'Stop') {
        record.state.lastStopEvent = ev;
      }
      _emitter.emit('worktree.changed', { path: wPath, state: _serialize(record) });
    },

    /**
     * Return all current worktree states (activity truncated to 50).
     * @returns {WorktreeState[]}
     */
    getSnapshot() {
      return Array.from(_map.values()).map((r) => _serialize(r, { truncateActivity: true }));
    },

    /**
     * Return entries that need a Jira refresh:
     *   - never fetched yet (lastFetchedAt = null) → cold start fill
     *   - or fetched longer than staleMs ago
     * Skips entries without a taskId or marked noContext.
     * @param {number} staleMs
     * @returns {WorktreeState[]}
     */
    getStaleEntries(staleMs) {
      const threshold = Date.now() - staleMs;
      const results = [];
      for (const record of _map.values()) {
        const { state } = record;
        if (!state.taskId) continue;
        if (state.noContext) continue;
        if (!state.lastFetchedAt) {
          results.push(_serialize(record));
          continue;
        }
        const fetchedMs = parseIsoUtcMs(state.lastFetchedAt);
        if (isNaN(fetchedMs) || fetchedMs < threshold) {
          results.push(_serialize(record));
        }
      }
      return results;
    },

    /**
     * Subscribe to store events.
     * @param {'worktree.changed'|'worktree.added'|'worktree.removed'} event
     * @param {Function} listener
     */
    on(event, listener) {
      _emitter.on(event, listener);
    },

    /**
     * Unsubscribe from store events.
     */
    off(event, listener) {
      _emitter.off(event, listener);
    },
  };
}

module.exports = { createStore };
