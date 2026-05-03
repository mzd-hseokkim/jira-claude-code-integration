'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Fields that must never appear in log output.
const REDACT_KEYS = new Set(['apiToken', 'Authorization', 'authorization']);

/**
 * Recursively redact sensitive keys from an object before JSON serialization.
 */
function redact(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return result;
}

/**
 * Create an append-only JSON line logger.
 *
 * @param {string} filePath  Absolute or workspace-relative log file path.
 * @returns {{ info, warn, error, close }}
 */
function createLogger(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });

  function write(level, event, data) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...(data !== undefined ? { data: redact(data) } : {}),
    });
    stream.write(line + '\n', (err) => {
      if (err) {
        // Fallback: do not throw; silently drop log line (disk full scenario).
        console.error('[logger] write error:', err.message);
      }
    });
  }

  function child(context) {
    // Normalize: null/undefined/primitive → empty context (no-op child)
    const ctx = (context !== null && typeof context === 'object' && !Array.isArray(context))
      ? context
      : {};

    return {
      info(event, data) { write('info', event, { ...ctx, ...data }); },
      warn(event, data) { write('warn', event, { ...ctx, ...data }); },
      error(event, data) { write('error', event, { ...ctx, ...data }); },
      // child.close is a no-op — stream is owned by the root logger
      close() { return Promise.resolve(); },
    };
  }

  return {
    info(event, data) { write('info', event, data); },
    warn(event, data) { write('warn', event, data); },
    error(event, data) { write('error', event, data); },
    close() {
      return new Promise((resolve) => stream.end(resolve));
    },
    child,
  };
}

module.exports = { createLogger };
