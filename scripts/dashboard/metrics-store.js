'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DB_DIR = path.join(os.homedir(), '.claude', 'jira-integration');
const DEFAULT_DB_FILE = path.join(DEFAULT_DB_DIR, 'metrics.db');
const DEFAULT_JSON_FILE = path.join(DEFAULT_DB_DIR, 'metrics.json');

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS spaces (
  id         TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  projectKey TEXT NOT NULL,
  credsOk    INTEGER NOT NULL DEFAULT 1,
  addedAt    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_current (
  issueKey        TEXT PRIMARY KEY,
  spaceId         TEXT NOT NULL,
  summary         TEXT,
  status          TEXT,
  statusCategory  TEXT,
  priority        TEXT,
  assignee        TEXT,
  issuetype       TEXT,
  created         TEXT,
  resolutiondate  TEXT,
  updated         TEXT,
  parent          TEXT,
  epic            TEXT,
  fetchedAt       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_snapshot (
  issueKey       TEXT NOT NULL,
  snapshotDate   TEXT NOT NULL,
  spaceId        TEXT NOT NULL,
  status         TEXT,
  statusCategory TEXT,
  resolutiondate TEXT,
  PRIMARY KEY (issueKey, snapshotDate)
);

CREATE INDEX IF NOT EXISTS idx_issue_current_space ON issue_current(spaceId);
CREATE INDEX IF NOT EXISTS idx_issue_snapshot_space_date ON issue_snapshot(spaceId, snapshotDate);
`;

function openSqlite(dbFile) {
  // better-sqlite3 capability probe — may throw if native module unavailable
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.exec(SCHEMA_SQL);
  return db;
}

// ---------------------------------------------------------------------------
// SQLite store implementation
// ---------------------------------------------------------------------------

function createSqliteStore(db) {
  const upsertSpace = db.prepare(`
    INSERT INTO spaces (id, site, projectKey, credsOk, addedAt)
    VALUES (@id, @site, @projectKey, @credsOk, @addedAt)
    ON CONFLICT(id) DO UPDATE SET
      site = excluded.site,
      projectKey = excluded.projectKey,
      credsOk = excluded.credsOk
  `);

  const upsertIssueCurrent = db.prepare(`
    INSERT INTO issue_current
      (issueKey, spaceId, summary, status, statusCategory, priority, assignee,
       issuetype, created, resolutiondate, updated, parent, epic, fetchedAt)
    VALUES
      (@issueKey, @spaceId, @summary, @status, @statusCategory, @priority, @assignee,
       @issuetype, @created, @resolutiondate, @updated, @parent, @epic, @fetchedAt)
    ON CONFLICT(issueKey) DO UPDATE SET
      spaceId = excluded.spaceId,
      summary = excluded.summary,
      status = excluded.status,
      statusCategory = excluded.statusCategory,
      priority = excluded.priority,
      assignee = excluded.assignee,
      issuetype = excluded.issuetype,
      created = excluded.created,
      resolutiondate = excluded.resolutiondate,
      updated = excluded.updated,
      parent = excluded.parent,
      epic = excluded.epic,
      fetchedAt = excluded.fetchedAt
  `);

  const upsertSnapshot = db.prepare(`
    INSERT INTO issue_snapshot (issueKey, snapshotDate, spaceId, status, statusCategory, resolutiondate)
    VALUES (@issueKey, @snapshotDate, @spaceId, @status, @statusCategory, @resolutiondate)
    ON CONFLICT(issueKey, snapshotDate) DO UPDATE SET
      status = excluded.status,
      statusCategory = excluded.statusCategory,
      resolutiondate = excluded.resolutiondate
  `);

  const upsertIssuesBatch = db.transaction((issues) => {
    const today = new Date().toISOString().slice(0, 10);
    for (const row of issues) {
      upsertIssueCurrent.run(row);
      upsertSnapshot.run({
        issueKey: row.issueKey,
        snapshotDate: today,
        spaceId: row.spaceId,
        status: row.status,
        statusCategory: row.statusCategory,
        resolutiondate: row.resolutiondate,
      });
    }
  });

  return {
    type: 'sqlite',

    upsertSpace(space) {
      upsertSpace.run({
        id: space.id,
        site: space.site,
        projectKey: space.projectKey,
        credsOk: space.credsOk ? 1 : 0,
        addedAt: space.addedAt || new Date().toISOString(),
      });
    },

    listSpaces() {
      return db.prepare('SELECT * FROM spaces').all().map((r) => ({
        ...r,
        credsOk: r.credsOk === 1,
      }));
    },

    replaceSpaces(spaces) {
      const keepIds = spaces.map((s) => s.id);
      const tx = db.transaction(() => {
        if (keepIds.length > 0) {
          const ph = keepIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM spaces WHERE id NOT IN (${ph})`).run(...keepIds);
          db.prepare(`DELETE FROM issue_current WHERE spaceId NOT IN (${ph})`).run(...keepIds);
          db.prepare(`DELETE FROM issue_snapshot WHERE spaceId NOT IN (${ph})`).run(...keepIds);
        } else {
          db.prepare('DELETE FROM spaces').run();
          db.prepare('DELETE FROM issue_current').run();
          db.prepare('DELETE FROM issue_snapshot').run();
        }
        for (const space of spaces) {
          upsertSpace.run({
            id: space.id,
            site: space.site,
            projectKey: space.projectKey,
            credsOk: space.credsOk ? 1 : 0,
            addedAt: space.addedAt || new Date().toISOString(),
          });
        }
      });
      tx();
    },

    upsertIssues(issues) {
      upsertIssuesBatch(issues);
    },

    getStatusDistribution(spaceId) {
      const rows = db.prepare(`
        SELECT status, statusCategory, COUNT(*) as count
        FROM issue_current
        WHERE spaceId = ?
        GROUP BY status, statusCategory
        ORDER BY count DESC
      `).all(spaceId);
      return rows;
    },

    getThroughput(spaceId, weeks = 8) {
      // throughput = issues whose resolutiondate falls within each week
      // resolutiondate를 직접 주차로 버킷팅 — snapshotDate 불일치로 인한 누락 방지
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);
      const startStr = startDate.toISOString().slice(0, 10);

      const rows = db.prepare(`
        SELECT
          strftime('%Y-%W', substr(resolutiondate, 1, 10)) as week,
          COUNT(*) as completed
        FROM issue_current
        WHERE spaceId = ?
          AND resolutiondate IS NOT NULL
          AND substr(resolutiondate, 1, 10) >= ?
        GROUP BY week
        ORDER BY week ASC
      `).all(spaceId, startStr);
      return rows;
    },

    getWip(spaceId) {
      const row = db.prepare(`
        SELECT COUNT(*) as count
        FROM issue_current
        WHERE spaceId = ?
          AND statusCategory = 'indeterminate'
      `).get(spaceId);
      return row ? row.count : 0;
    },

    getLeadTime(spaceId) {
      // lead time = resolutiondate - created (일 단위), resolved 이슈만
      const rows = db.prepare(`
        SELECT issueKey,
               CAST((julianday(substr(resolutiondate,1,10)) - julianday(substr(created,1,10))) AS INTEGER) AS days
        FROM issue_current
        WHERE spaceId = ?
          AND resolutiondate IS NOT NULL
          AND created IS NOT NULL
        ORDER BY days ASC
      `).all(spaceId);
      if (rows.length === 0) return { median: null, p75: null, p95: null, distribution: [] };
      const days = rows.map((r) => r.days);
      const median = days[Math.floor(days.length / 2)];
      const p75 = days[Math.floor(days.length * 0.75)];
      const p95 = days[Math.floor(days.length * 0.95)];
      return { median, p75, p95, distribution: rows };
    },

    getCycleTime(spaceId) {
      // cycle time(근사) = snapshot 최초 indeterminate 날짜 → resolutiondate, 일 단위
      const rows = db.prepare(`
        SELECT ic.issueKey,
               MIN(sn.snapshotDate) AS firstInProgressDate,
               ic.resolutiondate
        FROM issue_current ic
        JOIN issue_snapshot sn
          ON sn.issueKey = ic.issueKey
         AND sn.statusCategory = 'indeterminate'
        WHERE ic.spaceId = ?
          AND ic.resolutiondate IS NOT NULL
        GROUP BY ic.issueKey
      `).all(spaceId);
      if (rows.length === 0) return { median: null, p75: null, p95: null, distribution: [], note: '근사값' };
      const computed = rows.map((r) => {
        const days = Math.max(0, Math.round(
          (new Date(r.resolutiondate.slice(0, 10)) - new Date(r.firstInProgressDate)) / 86400000
        ));
        return { issueKey: r.issueKey, days };
      }).sort((a, b) => a.days - b.days);
      const days = computed.map((r) => r.days);
      const median = days[Math.floor(days.length / 2)];
      const p75 = days[Math.floor(days.length * 0.75)];
      const p95 = days[Math.floor(days.length * 0.95)];
      return { median, p75, p95, distribution: computed, note: '근사값' };
    },

    getPerAssignee(spaceId, weeks = 8) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);
      const startStr = startDate.toISOString().slice(0, 10);

      // 주간 완료 수
      const completedRows = db.prepare(`
        SELECT COALESCE(assignee, '__unassigned__') AS assignee,
               COUNT(*) AS completed
        FROM issue_current
        WHERE spaceId = ?
          AND resolutiondate IS NOT NULL
          AND substr(resolutiondate, 1, 10) >= ?
        GROUP BY assignee
      `).all(spaceId, startStr);

      // 현재 WIP
      const wipRows = db.prepare(`
        SELECT COALESCE(assignee, '__unassigned__') AS assignee,
               COUNT(*) AS wip
        FROM issue_current
        WHERE spaceId = ?
          AND statusCategory = 'indeterminate'
        GROUP BY assignee
      `).all(spaceId);

      const result = {};
      for (const r of completedRows) {
        result[r.assignee] = { assignee: r.assignee, completed: r.completed, wip: 0 };
      }
      for (const r of wipRows) {
        if (!result[r.assignee]) result[r.assignee] = { assignee: r.assignee, completed: 0, wip: 0 };
        result[r.assignee].wip = r.wip;
      }
      return Object.values(result).sort((a, b) => b.completed - a.completed);
    },

    getAgingWip(spaceId) {
      const today = new Date().toISOString().slice(0, 10);
      const rows = db.prepare(`
        SELECT issueKey, summary, assignee, created,
               CAST((julianday(?) - julianday(substr(created,1,10))) AS INTEGER) AS ageDays
        FROM issue_current
        WHERE spaceId = ?
          AND statusCategory = 'indeterminate'
          AND created IS NOT NULL
        ORDER BY ageDays DESC
      `).all(today, spaceId);
      return rows;
    },

    getPriorityDistribution(spaceId) {
      const rows = db.prepare(`
        SELECT COALESCE(priority, '(없음)') AS priority, COUNT(*) AS count
        FROM issue_current
        WHERE spaceId = ?
        GROUP BY priority
        ORDER BY count DESC
      `).all(spaceId);
      return rows;
    },

    getEpicProgress(spaceId) {
      // epic이 null인 이슈는 '(없음)' 그룹으로 표시
      const rows = db.prepare(`
        SELECT COALESCE(epic, '(없음)') AS epic,
               COUNT(*) AS total,
               SUM(CASE WHEN statusCategory = 'done' THEN 1 ELSE 0 END) AS done
        FROM issue_current
        WHERE spaceId = ?
        GROUP BY epic
        ORDER BY total DESC
      `).all(spaceId);
      return rows.map((r) => ({
        epic: r.epic,
        total: r.total,
        done: r.done,
        pct: r.total > 0 ? Math.round((r.done / r.total) * 100) : 0,
      }));
    },

    close() {
      try { db.close(); } catch { /* ignore */ }
    },
  };
}

// ---------------------------------------------------------------------------
// JSON fallback implementation
// ---------------------------------------------------------------------------

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { spaces: [], issues: {}, snapshots: {} };
  }
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function createJsonStore(jsonFile) {
  const data = loadJson(jsonFile);
  if (!data.spaces) data.spaces = [];
  if (!data.issues) data.issues = {};
  if (!data.snapshots) data.snapshots = {};

  function save() {
    saveJson(jsonFile, data);
  }

  return {
    type: 'json',

    upsertSpace(space) {
      const idx = data.spaces.findIndex((s) => s.id === space.id);
      if (idx >= 0) {
        data.spaces[idx] = { ...data.spaces[idx], ...space };
      } else {
        data.spaces.push({ addedAt: new Date().toISOString(), ...space });
      }
      save();
    },

    listSpaces() {
      return data.spaces.slice();
    },

    replaceSpaces(spaces) {
      const keep = new Set(spaces.map((s) => s.id));
      // stale space 및 그에 속한 issue/snapshot 제거
      data.spaces = data.spaces.filter((s) => keep.has(s.id));
      for (const [k, row] of Object.entries(data.issues)) {
        if (!keep.has(row.spaceId)) delete data.issues[k];
      }
      for (const [k, snap] of Object.entries(data.snapshots)) {
        if (!keep.has(snap.spaceId)) delete data.snapshots[k];
      }
      // 현재 스페이스 upsert
      for (const space of spaces) {
        const idx = data.spaces.findIndex((s) => s.id === space.id);
        if (idx >= 0) data.spaces[idx] = { ...data.spaces[idx], ...space };
        else data.spaces.push({ addedAt: new Date().toISOString(), ...space });
      }
      save();
    },

    upsertIssues(issues) {
      const today = new Date().toISOString().slice(0, 10);
      for (const row of issues) {
        data.issues[row.issueKey] = row;
        const snapshotKey = `${row.issueKey}::${today}`;
        data.snapshots[snapshotKey] = {
          issueKey: row.issueKey,
          snapshotDate: today,
          spaceId: row.spaceId,
          status: row.status,
          statusCategory: row.statusCategory,
          resolutiondate: row.resolutiondate,
        };
      }
      save();
    },

    getStatusDistribution(spaceId) {
      const counts = {};
      for (const issue of Object.values(data.issues)) {
        if (issue.spaceId !== spaceId) continue;
        const key = `${issue.status}::${issue.statusCategory}`;
        if (!counts[key]) {
          counts[key] = { status: issue.status, statusCategory: issue.statusCategory, count: 0 };
        }
        counts[key].count++;
      }
      return Object.values(counts).sort((a, b) => b.count - a.count);
    },

    getThroughput(spaceId, weeks = 8) {
      // throughput = issues whose resolutiondate falls within each week
      // resolutiondate를 직접 주차로 버킷팅 — snapshotDate 불일치로 인한 누락 방지
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);
      const startStr = startDate.toISOString().slice(0, 10);

      const weekCounts = {};
      for (const issue of Object.values(data.issues)) {
        if (issue.spaceId !== spaceId) continue;
        if (!issue.resolutiondate) continue;
        const resDate = issue.resolutiondate.slice(0, 10);
        if (resDate < startStr) continue;
        // ISO week approximation (YYYY-WW)
        const d = new Date(resDate);
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        const week = `${d.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
        if (!weekCounts[week]) weekCounts[week] = 0;
        weekCounts[week]++;
      }
      return Object.entries(weekCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, completed]) => ({ week, completed }));
    },

    getWip(spaceId) {
      return Object.values(data.issues).filter(
        (i) => i.spaceId === spaceId && i.statusCategory === 'indeterminate'
      ).length;
    },

    getLeadTime(spaceId) {
      const resolved = Object.values(data.issues).filter(
        (i) => i.spaceId === spaceId && i.resolutiondate && i.created
      );
      if (resolved.length === 0) return { median: null, p75: null, p95: null, distribution: [] };
      const items = resolved.map((i) => ({
        issueKey: i.issueKey,
        days: Math.max(0, Math.round(
          (new Date(i.resolutiondate.slice(0, 10)) - new Date(i.created.slice(0, 10))) / 86400000
        )),
      })).sort((a, b) => a.days - b.days);
      const days = items.map((r) => r.days);
      const median = days[Math.floor(days.length / 2)];
      const p75 = days[Math.floor(days.length * 0.75)];
      const p95 = days[Math.floor(days.length * 0.95)];
      return { median, p75, p95, distribution: items };
    },

    getCycleTime(spaceId) {
      // cycle time(근사): snapshot 최초 indeterminate 날짜 → resolutiondate
      const snapshots = Object.values(data.snapshots);
      const firstInProgress = {};
      for (const sn of snapshots) {
        if (sn.statusCategory !== 'indeterminate') continue;
        const issue = data.issues[sn.issueKey];
        if (!issue || issue.spaceId !== spaceId) continue;
        if (!firstInProgress[sn.issueKey] || sn.snapshotDate < firstInProgress[sn.issueKey]) {
          firstInProgress[sn.issueKey] = sn.snapshotDate;
        }
      }
      const computed = [];
      for (const [issueKey, firstDate] of Object.entries(firstInProgress)) {
        const issue = data.issues[issueKey];
        if (!issue || !issue.resolutiondate) continue;
        const days = Math.max(0, Math.round(
          (new Date(issue.resolutiondate.slice(0, 10)) - new Date(firstDate)) / 86400000
        ));
        computed.push({ issueKey, days });
      }
      if (computed.length === 0) return { median: null, p75: null, p95: null, distribution: [], note: '근사값' };
      computed.sort((a, b) => a.days - b.days);
      const days = computed.map((r) => r.days);
      const median = days[Math.floor(days.length / 2)];
      const p75 = days[Math.floor(days.length * 0.75)];
      const p95 = days[Math.floor(days.length * 0.95)];
      return { median, p75, p95, distribution: computed, note: '근사값' };
    },

    getPerAssignee(spaceId, weeks = 8) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);
      const startStr = startDate.toISOString().slice(0, 10);

      const result = {};
      for (const issue of Object.values(data.issues)) {
        if (issue.spaceId !== spaceId) continue;
        const key = issue.assignee || '__unassigned__';
        if (!result[key]) result[key] = { assignee: key, completed: 0, wip: 0 };
        if (issue.resolutiondate && issue.resolutiondate.slice(0, 10) >= startStr) {
          result[key].completed++;
        }
        if (issue.statusCategory === 'indeterminate') {
          result[key].wip++;
        }
      }
      return Object.values(result).sort((a, b) => b.completed - a.completed);
    },

    getAgingWip(spaceId) {
      const today = new Date().toISOString().slice(0, 10);
      return Object.values(data.issues)
        .filter((i) => i.spaceId === spaceId && i.statusCategory === 'indeterminate' && i.created)
        .map((i) => ({
          issueKey: i.issueKey,
          summary: i.summary,
          assignee: i.assignee,
          created: i.created,
          ageDays: Math.max(0, Math.round(
            (new Date(today) - new Date(i.created.slice(0, 10))) / 86400000
          )),
        }))
        .sort((a, b) => b.ageDays - a.ageDays);
    },

    getPriorityDistribution(spaceId) {
      const counts = {};
      for (const issue of Object.values(data.issues)) {
        if (issue.spaceId !== spaceId) continue;
        const key = issue.priority || '(없음)';
        if (!counts[key]) counts[key] = { priority: key, count: 0 };
        counts[key].count++;
      }
      return Object.values(counts).sort((a, b) => b.count - a.count);
    },

    getEpicProgress(spaceId) {
      const groups = {};
      for (const issue of Object.values(data.issues)) {
        if (issue.spaceId !== spaceId) continue;
        const key = issue.epic || '(없음)';
        if (!groups[key]) groups[key] = { epic: key, total: 0, done: 0 };
        groups[key].total++;
        if (issue.statusCategory === 'done') groups[key].done++;
      }
      return Object.values(groups)
        .sort((a, b) => b.total - a.total)
        .map((g) => ({
          ...g,
          pct: g.total > 0 ? Math.round((g.done / g.total) * 100) : 0,
        }));
    },

    close() { /* no-op */ },
  };
}

// ---------------------------------------------------------------------------
// Factory: probe better-sqlite3, swap to JSON fallback on failure
// ---------------------------------------------------------------------------

/**
 * Create a metrics store.
 *
 * @param {{ dbFile?: string, jsonFile?: string, _forceJson?: boolean }} [opts]
 *   _forceJson: test hook to force JSON fallback without touching native modules
 * @returns {{ type: string, upsertSpace, replaceSpaces, listSpaces, upsertIssues,
 *             getStatusDistribution, getThroughput, getWip, close }}
 */
function createMetricsStore(opts = {}) {
  const dbFile = opts.dbFile || DEFAULT_DB_FILE;
  const jsonFile = opts.jsonFile || DEFAULT_JSON_FILE;

  if (!opts._forceJson) {
    try {
      const db = openSqlite(dbFile);
      return createSqliteStore(db);
    } catch {
      // better-sqlite3 unavailable or native build failed → JSON fallback
    }
  }

  return createJsonStore(jsonFile);
}

module.exports = { createMetricsStore };
