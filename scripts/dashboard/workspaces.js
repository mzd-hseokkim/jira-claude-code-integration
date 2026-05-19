'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');

/**
 * In-process event bus for workspace registry changes.
 * Emits: 'workspace.registered' | 'workspace.unregistered' — payload: { path: string }
 */
const events = new EventEmitter();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

/**
 * Default registry directory: ~/.claude/jira-integration/
 * Override for tests via _setRegistryDirForTest().
 * @type {string | null}
 */
let _testRegistryDir = null;

function _getRegistryDir() {
  if (_testRegistryDir !== null) return _testRegistryDir;
  return path.join(os.homedir(), '.claude', 'jira-integration');
}

function _getRegistryFile() {
  return path.join(_getRegistryDir(), 'workspaces.json');
}

// ---------------------------------------------------------------------------
// JSDoc Types
// ---------------------------------------------------------------------------

/**
 * @typedef {{ path: string, registeredAt: string, lastSeenAt: string, status: 'active' | 'inactive' }} WorkspaceEntry
 * @typedef {{ version: number, workspaces: WorkspaceEntry[] }} RegistryFile
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Write JSON string atomically: temp file → chmod 0600 (best-effort, POSIX only) → rename.
 * On rename failure the temp file is cleaned up and the error is re-thrown.
 *
 * @param {string} filePath
 * @param {string} jsonStr
 */
function writeAtomic(filePath, jsonStr) {
  const dir = path.dirname(filePath);
  // Ensure directory exists (mode 0700, best-effort)
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // Ignore — directory may already exist or OS may not support mode
  }

  const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, jsonStr, { encoding: 'utf8' });
    // chmod 0600 — best-effort (POSIX only; Windows ACL not handled)
    try {
      fs.chmodSync(tmpFile, 0o600);
    } catch {
      // Intentionally ignored on Windows
    }
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    // Clean up temp on failure
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Read and parse the registry file.
 * On missing file: returns empty registry (normal initial state).
 * On parse/version error: renames file to .bak and returns empty registry.
 *
 * @param {{ logger?: { warn(msg: string, meta?: object): void } }} [opts]
 * @returns {RegistryFile}
 */
function readRegistry(opts = {}) {
  const logger = opts.logger || { warn: (msg, meta) => console.warn(msg, meta || '') };
  const filePath = _getRegistryFile();

  if (!fs.existsSync(filePath)) {
    return { version: SCHEMA_VERSION, workspaces: [] };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    logger.warn('[workspaces] Failed to read registry file', { path: filePath, err: err.message });
    return { version: SCHEMA_VERSION, workspaces: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    _moveToBak(filePath, logger);
    return { version: SCHEMA_VERSION, workspaces: [] };
  }

  if (!parsed || parsed.version !== SCHEMA_VERSION) {
    logger.warn('[workspaces] Unknown schema version, falling back to empty registry', {
      path: filePath,
      version: parsed && parsed.version,
    });
    _moveToBak(filePath, logger);
    return { version: SCHEMA_VERSION, workspaces: [] };
  }

  if (!Array.isArray(parsed.workspaces)) {
    logger.warn('[workspaces] Invalid registry format, falling back to empty registry', { path: filePath });
    _moveToBak(filePath, logger);
    return { version: SCHEMA_VERSION, workspaces: [] };
  }

  return parsed;
}

/**
 * Rename registry file to .bak for manual recovery.
 */
function _moveToBak(filePath, logger) {
  const bakPath = `${filePath}.bak`;
  try {
    fs.renameSync(filePath, bakPath);
    logger.warn('[workspaces] Corrupted registry moved to .bak', { bak: bakPath });
  } catch (err) {
    logger.warn('[workspaces] Failed to move corrupted registry to .bak', { err: err.message });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a workspace path.
 * If the path is already registered, only lastSeenAt is updated (idempotent).
 *
 * @param {string} workspacePath
 * @param {{ now?: Date }} [opts]  - `now` is injectable for tests
 * @returns {WorkspaceEntry}
 */
function register(workspacePath, opts = {}) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    throw new TypeError('workspacePath must be a non-empty string');
  }
  const resolved = path.resolve(workspacePath);
  const now = (opts.now instanceof Date ? opts.now : new Date()).toISOString();

  const registry = readRegistry();
  const existing = registry.workspaces.find((e) => e.path === resolved);

  let entry;
  if (existing) {
    existing.lastSeenAt = now;
    entry = existing;
  } else {
    entry = { path: resolved, registeredAt: now, lastSeenAt: now, status: 'active' };
    registry.workspaces.push(entry);
  }

  writeAtomic(_getRegistryFile(), JSON.stringify(registry, null, 2));
  events.emit('workspace.registered', { path: resolved });
  return { ...entry };
}

/**
 * Unregister a workspace path. No-op if not registered.
 *
 * @param {string} workspacePath
 * @returns {boolean} true if removed, false if not found (no-op)
 */
function unregister(workspacePath) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    throw new TypeError('workspacePath must be a non-empty string');
  }
  const resolved = path.resolve(workspacePath);
  const registry = readRegistry();
  const idx = registry.workspaces.findIndex((e) => e.path === resolved);
  if (idx === -1) return false;

  registry.workspaces.splice(idx, 1);
  writeAtomic(_getRegistryFile(), JSON.stringify(registry, null, 2));
  events.emit('workspace.unregistered', { path: resolved });
  return true;
}

/**
 * List all registered workspace entries (reads fresh from disk each call).
 *
 * @returns {WorkspaceEntry[]}
 */
function list() {
  const registry = readRegistry();
  return registry.workspaces.map((e) => ({ ...e }));
}

/**
 * Update lastSeenAt for an already-registered workspace. No-op if not registered.
 *
 * @param {string} workspacePath
 * @param {{ now?: Date }} [opts]
 * @returns {WorkspaceEntry | null}
 */
function touch(workspacePath, opts = {}) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
    throw new TypeError('workspacePath must be a non-empty string');
  }
  const resolved = path.resolve(workspacePath);
  const now = (opts.now instanceof Date ? opts.now : new Date()).toISOString();

  const registry = readRegistry();
  const existing = registry.workspaces.find((e) => e.path === resolved);
  if (!existing) return null;

  existing.lastSeenAt = now;
  writeAtomic(_getRegistryFile(), JSON.stringify(registry, null, 2));
  return { ...existing };
}

/**
 * Load registry and prune entries whose paths no longer exist on disk.
 * Pruned entries trigger a single warn log and a rewrite of the registry file.
 *
 * @param {{ logger?: { warn(msg: string, meta?: object): void } }} [opts]
 * @returns {{ workspaces: WorkspaceEntry[], pruned: string[] }}
 */
function loadAndPrune(opts = {}) {
  const logger = opts.logger || { warn: (msg, meta) => console.warn(msg, meta || '') };
  const registry = readRegistry({ logger });

  const alive = [];
  const pruned = [];

  for (const entry of registry.workspaces) {
    if (fs.existsSync(entry.path)) {
      alive.push(entry);
    } else {
      pruned.push(entry.path);
    }
  }

  if (pruned.length > 0) {
    registry.workspaces = alive;
    writeAtomic(_getRegistryFile(), JSON.stringify(registry, null, 2));
    logger.warn('[workspaces] Pruned missing workspace paths', { pruned });
  }

  return {
    workspaces: alive.map((e) => ({ ...e })),
    pruned,
  };
}

// ---------------------------------------------------------------------------
// Registry file watcher — detects external mutations (e.g. register-workspace.js
// invoked from another Node process) and emits the same registered/unregistered
// events that in-process register()/unregister() would emit.
// ---------------------------------------------------------------------------

/** @type {fs.FSWatcher | null} */
let _watcher = null;
/** @type {NodeJS.Timeout | null} */
let _watchDebounce = null;
/** @type {Set<string>} */
let _knownPaths = new Set();

function _diffAndEmit(logger) {
  let entries;
  try {
    entries = readRegistry({ logger }).workspaces;
  } catch (err) {
    logger && logger.warn && logger.warn('[workspaces] watcher read failed', { err: err.message });
    return;
  }
  const current = new Set(entries.map((e) => e.path));
  for (const p of current) {
    if (!_knownPaths.has(p)) events.emit('workspace.registered', { path: p });
  }
  for (const p of _knownPaths) {
    if (!current.has(p)) events.emit('workspace.unregistered', { path: p });
  }
  _knownPaths = current;
}

/**
 * Start watching the registry file for external changes. Idempotent.
 * Initial known-set is seeded from current disk state so no spurious events fire.
 *
 * @param {{ logger?: { info?: Function, warn?: Function } }} [opts]
 */
function startWatcher(opts = {}) {
  if (_watcher) return;
  const logger = opts.logger || null;
  const filePath = _getRegistryFile();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);

  // Seed known paths from current state — avoid firing events for entries
  // that were already present at startup.
  try {
    _knownPaths = new Set(readRegistry({ logger }).workspaces.map((e) => e.path));
  } catch {
    _knownPaths = new Set();
  }

  // Ensure dir exists so fs.watch doesn't ENOENT.
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { /* ignore */ }

  try {
    _watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
      if (filename && filename !== base) return;
      if (_watchDebounce) clearTimeout(_watchDebounce);
      _watchDebounce = setTimeout(() => {
        _watchDebounce = null;
        _diffAndEmit(logger);
      }, 100);
    });
    logger && logger.info && logger.info('[workspaces] registry watcher started', { file: filePath });
  } catch (err) {
    logger && logger.warn && logger.warn('[workspaces] watcher start failed', { err: err.message });
    _watcher = null;
  }
}

function stopWatcher() {
  if (_watchDebounce) { clearTimeout(_watchDebounce); _watchDebounce = null; }
  if (_watcher) { try { _watcher.close(); } catch { /* ignore */ } _watcher = null; }
  _knownPaths = new Set();
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

/**
 * Override the registry directory for unit tests.
 * Pass null to restore default behaviour.
 *
 * @param {string | null} dir
 */
function _setRegistryDirForTest(dir) {
  _testRegistryDir = dir;
}

// ---------------------------------------------------------------------------

module.exports = {
  register,
  unregister,
  list,
  touch,
  loadAndPrune,
  startWatcher,
  stopWatcher,
  _setRegistryDirForTest,
  events,
};
