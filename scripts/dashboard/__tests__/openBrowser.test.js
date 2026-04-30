'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { openBrowser } = require('../openBrowser');

const URL = 'http://127.0.0.1:4173';

/** Minimal logger stub that records calls. */
function makeLogger() {
  const calls = { info: [], warn: [] };
  return {
    info(event, data) { calls.info.push({ event, data }); },
    warn(event, data) { calls.warn.push({ event, data }); },
    calls,
  };
}

/** Spawn stub: returns a fake child that does nothing by default. */
function makeSpawnStub() {
  let lastChild;
  const stub = function spawnStub(cmd, args, _opts) {
    lastChild = new EventEmitter();
    lastChild.unref = () => {};
    lastChild._cmd = cmd;
    lastChild._args = args;
    stub.calls.push({ cmd, args });
    return lastChild;
  };
  stub.calls = [];
  stub.getLastChild = () => lastChild;
  return stub;
}

// U1: DASHBOARD_NO_OPEN=1 → spawn 미호출, logger.info('browser.open-skipped') 1회
test('U1: DASHBOARD_NO_OPEN=1 skips spawn and logs browser.open-skipped', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();

  openBrowser(URL, { logger, env: { DASHBOARD_NO_OPEN: '1' }, spawn: spawnStub });

  assert.equal(spawnStub.calls.length, 0, 'spawn must not be called');
  assert.equal(logger.calls.info.length, 1);
  assert.equal(logger.calls.info[0].event, 'browser.open-skipped');
  assert.equal(logger.calls.info[0].data.reason, 'env');
});

// U1b: DASHBOARD_NO_OPEN=true (string) also skips
test('U1b: DASHBOARD_NO_OPEN=true (string) also skips', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();

  openBrowser(URL, { logger, env: { DASHBOARD_NO_OPEN: 'true' }, spawn: spawnStub });

  assert.equal(spawnStub.calls.length, 0);
  assert.equal(logger.calls.info[0].event, 'browser.open-skipped');
});

// U2: macOS → spawn('open', [url], { detached, stdio:'ignore' })
test('U2: darwin platform uses "open" command', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();
  const origPlatform = process.platform;

  // Temporarily override process.platform (non-enumerable property workaround)
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    openBrowser(URL, { logger, env: {}, spawn: spawnStub });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }

  assert.equal(spawnStub.calls.length, 1);
  assert.equal(spawnStub.calls[0].cmd, 'open');
  assert.deepEqual(spawnStub.calls[0].args, [URL]);
  assert.equal(logger.calls.info[0].event, 'browser.open-attempted');
});

// U3: Linux → spawn('xdg-open', [url], ...)
test('U3: linux platform uses "xdg-open" command', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();
  const origPlatform = process.platform;

  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    openBrowser(URL, { logger, env: {}, spawn: spawnStub });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }

  assert.equal(spawnStub.calls.length, 1);
  assert.equal(spawnStub.calls[0].cmd, 'xdg-open');
  assert.deepEqual(spawnStub.calls[0].args, [URL]);
});

// U4: Windows → spawn('cmd', ['/c','start','""', url], ...)
test('U4: win32 platform uses "cmd /c start" with empty title arg', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();
  const origPlatform = process.platform;

  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    openBrowser(URL, { logger, env: {}, spawn: spawnStub });
  } finally {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
  }

  assert.equal(spawnStub.calls.length, 1);
  assert.equal(spawnStub.calls[0].cmd, 'cmd');
  assert.deepEqual(spawnStub.calls[0].args, ['/c', 'start', '""', URL]);
});

// U5: spawn 에러 emit → logger.warn('browser.open-failed'), 예외 없음
test('U5: spawn error event triggers logger.warn and does not throw', () => {
  const logger = makeLogger();
  const spawnStub = makeSpawnStub();

  openBrowser(URL, { logger, env: {}, spawn: spawnStub });

  // Simulate ENOENT error from spawned child
  const fakeErr = Object.assign(new Error('xdg-open: not found'), { code: 'ENOENT' });
  spawnStub.getLastChild().emit('error', fakeErr);

  assert.equal(logger.calls.warn.length, 1);
  assert.equal(logger.calls.warn[0].event, 'browser.open-failed');
  assert.equal(logger.calls.warn[0].data.code, 'ENOENT');
  // No unhandled exception — test itself completes cleanly
});
