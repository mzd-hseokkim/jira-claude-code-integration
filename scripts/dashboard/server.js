'use strict';

const path = require('node:path');
const http = require('node:http');

const { createStore } = require('./store');
const { createLogger } = require('./logger');
const { loadCredentials } = require('./credentials');
const { startWorktreeCollector } = require('./collectors/worktree');
const { startJiraCollector } = require('./collectors/jira');
const { createIngestRouter } = require('./routes/ingest');
const { createCleanupRouter } = require('./routes/cleanup');
const { openBrowser } = require('./openBrowser');

const DEFAULT_PORT = 8765;

/**
 * Start the dashboard backend server.
 *
 * @param {{ port?: number, workspaceRoot?: string, openBrowser?: boolean }} [opts]
 * @returns {Promise<{ stop(): Promise<void> }>}
 */
async function startServer(opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  const workspaceRoot = opts.workspaceRoot ?? process.cwd();
  const shouldOpenBrowser = opts.openBrowser ?? true;
  const logFile = path.join(workspaceRoot, 'logs', 'dashboard-server.log');

  const logger = createLogger(logFile);

  // Validate credentials early — throw CredentialsNotFoundError if missing.
  const creds = loadCredentials({ workspaceRoot });
  logger.info('server.credentials-loaded', { source: creds.source });

  const store = createStore();

  // Wire up SSE broadcasts from store events.
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();

  function broadcast(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }

  store.on('worktree.added', ({ path: wPath, state }) => {
    logger.info('store.worktree-added', { path: wPath });
    broadcast('worktree.added', { path: wPath, state, ts: new Date().toISOString() });
  });
  store.on('worktree.changed', ({ path: wPath, state }) => {
    broadcast('worktree.changed', { path: wPath, state, ts: new Date().toISOString() });
  });
  store.on('worktree.removed', ({ path: wPath }) => {
    logger.info('store.worktree-removed', { path: wPath });
    broadcast('worktree.removed', { path: wPath, ts: new Date().toISOString() });
  });

  // Create minimal HTTP server (avoids Express dependency at import time for tests,
  // but in production we use express if available, falling back to node:http).
  let app;
  try {
    const express = require('express');
    app = express();
    app.get('/events', handleSSE);
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.use('/ingest', createIngestRouter(store, logger));
    app.use('/cleanup', createCleanupRouter(store, logger, workspaceRoot));
    app.use(express.static(path.join(__dirname, 'public')));
  } catch {
    // express not available — use raw http (minimal, for environments without npm install)
    app = null;
  }

  function handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders && res.flushHeaders();

    clients.add(res);
    logger.info('sse.client-connected', { total: clients.size });

    // Send initial snapshot — 신규 클라이언트가 즉시 polling cycle phase에
    // 맞출 수 있도록 lastTickAt/tickMs/serverNowMs 포함.
    const snapshot = store.getSnapshot();
    res.write(`event: snapshot\ndata: ${JSON.stringify({
      worktrees: snapshot,
      ts: new Date().toISOString(),
      lastTickAt,
      tickMs: lastTickMs,
      serverNowMs: Date.now(),
    })}\n\n`);

    req.on('close', () => {
      clients.delete(res);
      logger.info('sse.client-disconnected', { total: clients.size });
    });
  }

  const httpServer = app
    ? http.createServer(app)
    : http.createServer((req, res) => {
        if (req.url === '/events') return handleSSE(req, res);
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

  // Start collectors
  const worktreeCollector = startWorktreeCollector(store, { workspaceRoot, logger });
  // 마지막 jira-collector tick 시점/주기 — snapshot 이벤트에 포함시켜
  // 새 SSE 클라이언트도 즉시 polling 사이클 phase에 맞출 수 있게 한다.
  let lastTickAt = null;
  let lastTickMs = null;
  const jiraCollector = startJiraCollector(store, {
    logger,
    getCredentials: () => loadCredentials({ workspaceRoot }),
    onTick: ({ at, tickMs }) => {
      lastTickAt = at;
      lastTickMs = tickMs;
      broadcast('jira-collector.tick', { at, tickMs });
    },
  });

  await new Promise((resolve, reject) => {
    httpServer.listen(port, '127.0.0.1', () => {
      logger.info('server.started', { port, workspaceRoot });
      console.log(`[dashboard] server listening on http://127.0.0.1:${port}`);
      console.log(`[dashboard] log file: ${logFile}`);
      if (shouldOpenBrowser) {
        openBrowser(`http://127.0.0.1:${port}`, { logger });
      }
      resolve();
    });
    httpServer.once('error', reject);
  });

  return {
    async stop() {
      worktreeCollector.stop();
      jiraCollector.stop();
      await new Promise((resolve) => httpServer.close(resolve));
      await logger.close();
    },
  };
}

// CLI entry point
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[dashboard] startup error:', err.message);
    process.exit(1);
  });
}

module.exports = { startServer };
