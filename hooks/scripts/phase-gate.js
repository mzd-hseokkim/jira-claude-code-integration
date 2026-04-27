#!/usr/bin/env node

/**
 * PreToolUse Hook: Phase gate for /jira-task workflow.
 *
 * Intercepts Skill tool calls to `jira-integration:jira-task-<phase>` and
 * blocks them when prerequisite phases or required artifacts are missing,
 * based on `phase-gate.config.json` (MAE-122).
 *
 * Fail-open: any unexpected error (missing context, broken config, parse
 * failure, etc.) results in exit 0 so the gate cannot break the hook chain.
 *
 * See docs/design/MAE-123.design.md for the full specification.
 */

const fs = require('fs');
const path = require('path');

const MAX_UPWARD_LEVELS = 6;
const SKILL_PATTERN = /^(?:jira-integration:)?jira-task-([a-z]+)$/;
const BYPASS_ENV_VAR = 'JIRA_PHASE_GATE_BYPASS';

function isEnvTruthy(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const lower = trimmed.toLowerCase();
  if (lower === '0' || lower === 'false') return false;
  return true;
}

function isBypassed(env, context) {
  if (env && isEnvTruthy(env[BYPASS_ENV_VAR])) return 'env';
  if (context && context.bypassGate === true) return 'context';
  return null;
}

function readStdinSync() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractPhase(toolName, toolInput) {
  if (toolName !== 'Skill') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  const skill = toolInput.skill;
  if (typeof skill !== 'string') return null;
  const m = skill.match(SKILL_PATTERN);
  return m ? m[1] : null;
}

function findContextFile(startDir) {
  let dir = startDir;
  for (let i = 0; i <= MAX_UPWARD_LEVELS; i++) {
    const candidate = path.join(dir, '.jira-context.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig(scriptDir) {
  return loadJsonSafe(path.join(scriptDir, 'phase-gate.config.json'));
}

function validate(phase, config, context, contextDir) {
  const phases = config && config.phases;
  if (!phases || typeof phases !== 'object') {
    return { ok: true, reason: 'no-config' };
  }
  const rule = phases[phase];
  if (!rule) {
    return { ok: true, reason: 'phase-not-defined' };
  }
  if (rule.enforced === false) {
    return { ok: true, reason: 'phase-not-enforced' };
  }

  const completedSteps = Array.isArray(context.completedSteps)
    ? context.completedSteps
    : [];
  const requires = Array.isArray(rule.requires) ? rule.requires : [];
  const missingPhases = requires.filter((p) => !completedSteps.includes(p));
  if (missingPhases.length > 0) {
    return {
      ok: false,
      reason: 'missing-requires',
      requiredPhases: missingPhases,
      taskId: context.taskId,
    };
  }

  const taskId = typeof context.taskId === 'string' ? context.taskId : null;
  const artifacts = Array.isArray(rule.artifacts) ? rule.artifacts : [];
  if (artifacts.length > 0 && taskId) {
    const missingArtifacts = [];
    for (const a of artifacts) {
      if (!a || typeof a.fileGlob !== 'string') continue;
      const replaced = a.fileGlob.replace(/\{TASK_ID\}/g, taskId);
      const abs = path.resolve(contextDir, replaced);
      if (!fs.existsSync(abs)) missingArtifacts.push(replaced);
    }
    if (missingArtifacts.length > 0) {
      return {
        ok: false,
        reason: 'missing-artifact',
        missingArtifacts,
        taskId,
      };
    }
  }

  return { ok: true };
}

function formatBlockMessage(phase, result) {
  const taskId = result.taskId || '<TASK-ID>';
  const lines = [];
  lines.push(`🚫 phase gate: '${phase}' 단계 진입 차단 (${taskId})`);
  if (result.reason === 'missing-requires') {
    const missing = result.requiredPhases.join(', ');
    lines.push(`필요한 선행 단계: ${missing}`);
    const first = result.requiredPhases[0];
    lines.push(`먼저 실행: /jira-task ${first} ${taskId}`);
  } else if (result.reason === 'missing-artifact') {
    lines.push(`필요한 산출물 누락:`);
    for (const p of result.missingArtifacts) lines.push(`  - ${p}`);
    lines.push(`해당 단계를 먼저 실행해 산출물을 생성하세요.`);
  }
  lines.push(`우회 (1회성): JIRA_PHASE_GATE_BYPASS=1`);
  lines.push(`우회 (영속): .jira-context.json에 "bypassGate": true 추가`);
  return lines.join('\n');
}

function emitDeny(message) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: message,
    },
  };
  try {
    process.stdout.write(JSON.stringify(payload));
  } catch {
    // ignore — stderr + exit 2 still blocks
  }
  try {
    process.stderr.write(message + '\n');
  } catch {
    // ignore
  }
}

function main() {
  let payload;
  try {
    payload = readStdinSync();
  } catch {
    process.exit(0);
    return;
  }
  if (!payload) {
    process.exit(0);
    return;
  }

  const phase = extractPhase(payload.tool_name, payload.tool_input);
  if (!phase) {
    process.exit(0);
    return;
  }

  const contextPath = findContextFile(process.cwd());
  if (!contextPath) {
    process.exit(0);
    return;
  }
  const context = loadJsonSafe(contextPath);
  if (!context) {
    process.exit(0);
    return;
  }
  const contextDir = path.dirname(contextPath);

  const config = loadConfig(__dirname);
  if (!config) {
    process.exit(0);
    return;
  }

  let result;
  try {
    result = validate(phase, config, context, contextDir);
  } catch {
    process.exit(0);
    return;
  }

  if (result.ok) {
    process.exit(0);
    return;
  }

  const bypassChannel = isBypassed(process.env, context);
  if (bypassChannel) {
    const taskId = context.taskId || '<TASK-ID>';
    const detail = bypassChannel === 'env'
      ? `(${BYPASS_ENV_VAR} 환경변수)`
      : `(.jira-context.json: bypassGate=true)`;
    const msg = `⚠️ phase gate bypassed (${bypassChannel}): '${phase}' 단계가 선행 요건을 만족하지 않지만 우회되었습니다 ${detail} — ${taskId}`;
    try {
      process.stderr.write(msg + '\n');
    } catch {
      // ignore
    }
    process.exit(0);
    return;
  }

  emitDeny(formatBlockMessage(phase, result));
  process.exit(2);
}

if (require.main === module) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}

module.exports = {
  extractPhase,
  findContextFile,
  loadConfig,
  validate,
  formatBlockMessage,
  isBypassed,
  isEnvTruthy,
};
