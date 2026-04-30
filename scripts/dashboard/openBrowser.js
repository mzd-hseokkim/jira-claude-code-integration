'use strict';

const defaultSpawn = require('node:child_process').spawn;

/**
 * Determine the OS-specific command + args to open a URL in the default browser.
 *
 * @param {string} url
 * @returns {{ cmd: string, args: string[] }}
 */
function platformCmd(url) {
  switch (process.platform) {
    case 'darwin':
      return { cmd: 'open', args: [url] };
    case 'win32':
      // NOTE: The empty-string first arg is intentional — without it, `start`
      // treats the URL as the window title and may open a blank tab or error.
      return { cmd: 'cmd', args: ['/c', 'start', '""', url] };
    default:
      // Linux and anything else: rely on xdg-open (freedesktop.org standard).
      return { cmd: 'xdg-open', args: [url] };
  }
}

/**
 * Open `url` in the OS default browser, detached from the current process.
 *
 * Options:
 *   - `logger`  — required logger ({ info, warn }) for structured log output.
 *   - `env`     — process.env override (defaults to process.env); used in tests.
 *   - `spawn`   — child_process.spawn override (defaults to node:child_process spawn); used in tests.
 *
 * Returns immediately after spawning (fire-and-forget). Never throws.
 *
 * @param {string} url
 * @param {{ logger: { info(e:string,d?:object):void, warn(e:string,d?:object):void }, env?: NodeJS.ProcessEnv, spawn?: typeof import('node:child_process').spawn }} opts
 */
function openBrowser(url, { logger, env = process.env, spawn = defaultSpawn }) {
  // Opt-out: DASHBOARD_NO_OPEN=1|true|yes skips spawn entirely.
  if (/^(1|true|yes)$/i.test(env.DASHBOARD_NO_OPEN || '')) {
    logger.info('browser.open-skipped', { reason: 'env', env_var: 'DASHBOARD_NO_OPEN' });
    return;
  }

  const { cmd, args } = platformCmd(url);
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });

  child.on('error', (err) => {
    logger.warn('browser.open-failed', { cmd, code: err.code, message: err.message });
  });

  // Detach: prevent parent from waiting for the browser child process.
  child.unref();

  logger.info('browser.open-attempted', { platform: process.platform, cmd, url });
}

module.exports = { openBrowser };
