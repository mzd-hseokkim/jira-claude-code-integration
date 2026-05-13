'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Express 라우터: 완료된 worktree의 git worktree + branch 정리.
 *
 * POST /cleanup
 *   body: { path: "<worktree absolute path>" }
 *   → 200: { ok: true, removed: { worktree: true, branch: true|false } }
 *   → 400: { error: 'reason' }
 *
 * 안전장치:
 *  - path는 반드시 store에 등록된 경로여야 함 (임의 경로 차단).
 *  - cachedIssue.status가 "완료" / "Done" 일 때만 허용.
 *  - dirty 워킹트리면 거부 (git status --porcelain 결과 비어있어야).
 *  - branch 이름은 store의 worktree.branch 필드에서 가져옴 (요청 body에서 받지 않음).
 *  - shell 사용 X, spawnSync로 인자 분리 (injection 방지).
 *
 * @param {object} store
 * @param {object} [logger]
 * @param {string} repoRoot - git 명령을 실행할 메인 레포 경로
 * @returns {import('express').Router}
 */
function createCleanupRouter(store, logger, repoRoot) {
  const express = require('express');
  const router = express.Router();
  router.use(express.json({ limit: '4kb' }));

  router.post('/', (req, res) => {
    const wtPath = req.body?.path;
    if (typeof wtPath !== 'string' || !wtPath) {
      return res.status(400).json({ error: 'path required' });
    }

    // store에 등록된 worktree만 허용.
    const snapshot = store.getSnapshot();
    const entry = snapshot.find((w) => w.path === wtPath);
    if (!entry) {
      logger && logger.warn('cleanup.unknown-path', { path: wtPath });
      return res.status(400).json({ error: 'unknown worktree path' });
    }

    // entry 확정 후 workspace child logger 파생
    const log = logger && typeof logger.child === 'function' && entry.workspaceRoot
      ? logger.child({ workspace: entry.workspaceRoot })
      : logger;

    // 완료 상태만 허용.
    const status = entry.cachedIssue?.status ?? entry.status ?? null;
    const doneStatuses = new Set(['완료', 'Done', 'done']);
    if (!doneStatuses.has(status)) {
      log && log.warn('cleanup.not-done', { path: wtPath, status });
      return res.status(400).json({ error: 'worktree not in done state', status });
    }

    // dirty 검사. worktree의 .git 링크가 손상되어 있으면 git status가 실패하는데,
    // 그 경우는 "stale worktree"로 간주하여 dirty 체크를 건너뛰고 fallback 경로로
    // 진입한다 (admin record만 남고 작업 디렉토리는 비정상 상태인 케이스).
    let staleWorktree = false;
    const dirtyCheck = spawnSync('git', ['status', '--porcelain'], {
      cwd: wtPath,
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (dirtyCheck.status !== 0) {
      staleWorktree = true;
      log && log.warn('cleanup.git-status-failed-stale', { path: wtPath, stderr: dirtyCheck.stderr });
    } else if (dirtyCheck.stdout.trim().length > 0) {
      return res.status(400).json({ error: 'worktree has uncommitted changes' });
    }

    const branch = entry.branch ?? null;

    // 1차: git worktree remove --force (--force는 dirty/missing .git 일부 케이스도 처리).
    const wtRemove = spawnSync('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 15_000,
    });

    let removalMode = 'git';
    if (wtRemove.status !== 0) {
      // 2차 fallback: 디렉토리가 남아있거나 admin record가 stale인 케이스.
      // Windows 예약명 파일(nul, con 등)이 있어도 walk 기반 삭제로 정리.
      log && log.warn('cleanup.worktree-remove-failed-falling-back', {
        path: wtPath,
        stderr: wtRemove.stderr?.slice(0, 200),
      });
      try {
        if (fs.existsSync(wtPath)) {
          fs.rmSync(wtPath, { recursive: true, force: true, maxRetries: 3 });
        }
        const prune = spawnSync('git', ['worktree', 'prune'], {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: 10_000,
        });
        if (prune.status !== 0) {
          log && log.error('cleanup.prune-failed', { stderr: prune.stderr });
          return res.status(500).json({
            error: 'git worktree prune failed',
            detail: prune.stderr?.slice(0, 200),
          });
        }
        removalMode = 'fallback';
      } catch (err) {
        log && log.error('cleanup.fallback-rm-failed', { path: wtPath, err: err.message });
        return res.status(500).json({
          error: 'worktree directory removal failed',
          detail: err.message,
        });
      }
    }
    log && log.info('cleanup.worktree-removed', { path: wtPath, mode: removalMode, stale: staleWorktree });

    // branch 삭제 (best-effort — 실패해도 worktree는 이미 제거됨).
    let branchRemoved = false;
    if (branch && /^[a-zA-Z0-9_/.-]+$/.test(branch)) {
      const brRemove = spawnSync('git', ['branch', '-d', branch], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (brRemove.status === 0) {
        branchRemoved = true;
        log && log.info('cleanup.branch-removed', { branch });
      } else {
        log && log.warn('cleanup.branch-remove-failed', { branch, stderr: brRemove.stderr?.slice(0, 200) });
      }
    }

    // store에서 즉시 제거 (worktree collector가 다음 polling에서 어차피 제거하지만,
    // 즉시 broadcast 하기 위해 명시 호출).
    store.removeWorktree(wtPath);

    return res.json({
      ok: true,
      removed: { worktree: true, branch: branchRemoved },
      branch,
    });
  });

  return router;
}

module.exports = { createCleanupRouter };
