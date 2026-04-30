'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLogger } = require('../logger');

/**
 * Create a temp log file, write entries, close, and read back the content.
 */
async function withTempLog(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  const filePath = path.join(dir, 'test.log');
  const logger = createLogger(filePath);
  await fn(logger);
  await logger.close();
  const content = fs.readFileSync(filePath, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return content;
}

// U6: apiToken top-level → [REDACTED], raw value absent
test('U6: apiToken value is redacted in log output', async () => {
  const content = await withTempLog((logger) => {
    logger.info('test.event', { apiToken: 'secret123', name: 'alice' });
  });

  assert.ok(!content.includes('secret123'), 'raw apiToken must not appear in log');
  assert.ok(content.includes('[REDACTED]'), '[REDACTED] must appear in log');
});

// U6b: Authorization nested → [REDACTED]
test('U6b: nested Authorization header is redacted', async () => {
  const content = await withTempLog((logger) => {
    logger.info('test.nested', { nested: { Authorization: 'Bearer xyz', safe: 'visible' } });
  });

  assert.ok(!content.includes('xyz'), 'raw Authorization value must not appear in log');
  assert.ok(!content.includes('Bearer'), 'Bearer prefix must not appear in log');
  assert.ok(content.includes('[REDACTED]'), '[REDACTED] must appear');
  assert.ok(content.includes('visible'), 'non-sensitive field must remain visible');
});

// U6c: lowercase authorization also redacted
test('U6c: lowercase "authorization" key is redacted', async () => {
  const content = await withTempLog((logger) => {
    logger.warn('test.lower', { authorization: 'token-abc' });
  });

  assert.ok(!content.includes('token-abc'), 'raw authorization value must not appear in log');
  assert.ok(content.includes('[REDACTED]'), '[REDACTED] must appear');
});
