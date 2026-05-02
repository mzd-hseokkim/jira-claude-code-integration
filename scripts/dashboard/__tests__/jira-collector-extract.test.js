'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractEpic, extractParent, extractLinks } = require('../collectors/jira');

// ─────────────────────────────────────────────────────────────
// extractEpic
// ─────────────────────────────────────────────────────────────

test('extractEpic: Story with Epic parent returns epic key', () => {
  const fields = {
    issuetype: { name: '작업' },
    parent: { key: 'MAE-249', fields: { issuetype: { name: 'Epic' } } },
  };
  assert.equal(extractEpic(fields), 'MAE-249');
});

test('extractEpic: Story with Korean 에픽 parent returns epic key', () => {
  const fields = {
    issuetype: { name: 'Story' },
    parent: { key: 'MAE-200', fields: { issuetype: { name: '에픽' } } },
  };
  assert.equal(extractEpic(fields), 'MAE-200');
});

test('extractEpic: Epic itself returns null (not its own epic)', () => {
  const fields = {
    issuetype: { name: 'Epic' },
    parent: { key: 'MAE-100', fields: { issuetype: { name: 'Epic' } } },
  };
  assert.equal(extractEpic(fields), null);
});

test('extractEpic: Subtask with Story parent returns null (grandparent not expanded)', () => {
  const fields = {
    issuetype: { name: 'Subtask' },
    parent: { key: 'MAE-250', fields: { issuetype: { name: '작업' } } },
  };
  assert.equal(extractEpic(fields), null);
});

test('extractEpic: Story without parent returns null', () => {
  const fields = { issuetype: { name: '작업' } };
  assert.equal(extractEpic(fields), null);
});

test('extractEpic: parent without key returns null', () => {
  const fields = {
    issuetype: { name: '작업' },
    parent: { fields: { issuetype: { name: 'Epic' } } },
  };
  assert.equal(extractEpic(fields), null);
});

test('extractEpic: null/undefined fields returns null', () => {
  assert.equal(extractEpic(null), null);
  assert.equal(extractEpic(undefined), null);
});

// ─────────────────────────────────────────────────────────────
// extractParent
// ─────────────────────────────────────────────────────────────

test('extractParent: returns parent summary object', () => {
  const fields = {
    parent: {
      key: 'MAE-250',
      fields: {
        summary: 'Parent Story',
        status: { name: '진행 중', statusCategory: { key: 'indeterminate' } },
      },
    },
  };
  assert.deepEqual(extractParent(fields), {
    key: 'MAE-250',
    summary: 'Parent Story',
    status: '진행 중',
    statusCategory: 'indeterminate',
  });
});

test('extractParent: missing optional sub-fields default to null', () => {
  const fields = { parent: { key: 'MAE-1' } };
  assert.deepEqual(extractParent(fields), {
    key: 'MAE-1',
    summary: null,
    status: null,
    statusCategory: null,
  });
});

test('extractParent: no parent returns null', () => {
  assert.equal(extractParent({}), null);
});

test('extractParent: parent without key returns null', () => {
  assert.equal(extractParent({ parent: { fields: { summary: 'x' } } }), null);
});

test('extractParent: null fields returns null', () => {
  assert.equal(extractParent(null), null);
  assert.equal(extractParent(undefined), null);
});

// ─────────────────────────────────────────────────────────────
// extractLinks (Blocks only — Phase 1)
// ─────────────────────────────────────────────────────────────

test('extractLinks: outwardIssue → blockedBy (그 이슈가 현재 이슈를 blocks)', () => {
  const fields = {
    issuelinks: [{
      type: { name: 'Blocks' },
      outwardIssue: {
        key: 'MAE-200',
        fields: {
          summary: 'Blocker',
          status: { name: '완료', statusCategory: { key: 'done' } },
        },
      },
    }],
  };
  const result = extractLinks(fields);
  assert.deepEqual(result.blockedBy, [{
    key: 'MAE-200',
    summary: 'Blocker',
    status: '완료',
    statusCategory: 'done',
  }]);
  assert.deepEqual(result.blocks, []);
});

test('extractLinks: inwardIssue → blocks (현재 이슈가 그 이슈를 blocks)', () => {
  const fields = {
    issuelinks: [{
      type: { name: 'Blocks' },
      inwardIssue: {
        key: 'MAE-300',
        fields: {
          summary: 'Blocked target',
          status: { name: '할 일', statusCategory: { key: 'new' } },
        },
      },
    }],
  };
  const result = extractLinks(fields);
  assert.deepEqual(result.blocks, [{
    key: 'MAE-300',
    summary: 'Blocked target',
    status: '할 일',
    statusCategory: 'new',
  }]);
  assert.deepEqual(result.blockedBy, []);
});

test('extractLinks: ignores non-Blocks link types', () => {
  const fields = {
    issuelinks: [
      { type: { name: 'Relates' }, outwardIssue: { key: 'MAE-1', fields: {} } },
      { type: { name: 'Cloners' }, inwardIssue: { key: 'MAE-2', fields: {} } },
    ],
  };
  assert.deepEqual(extractLinks(fields), { blocks: [], blockedBy: [] });
});

test('extractLinks: handles missing fields on linked issue', () => {
  const fields = {
    issuelinks: [{
      type: { name: 'Blocks' },
      outwardIssue: { key: 'MAE-9' },
    }],
  };
  const result = extractLinks(fields);
  assert.deepEqual(result.blockedBy, [{
    key: 'MAE-9',
    summary: null,
    status: null,
    statusCategory: null,
  }]);
});

test('extractLinks: empty/missing issuelinks returns empty arrays', () => {
  assert.deepEqual(extractLinks({}), { blocks: [], blockedBy: [] });
  assert.deepEqual(extractLinks({ issuelinks: [] }), { blocks: [], blockedBy: [] });
  assert.deepEqual(extractLinks(null), { blocks: [], blockedBy: [] });
  assert.deepEqual(extractLinks(undefined), { blocks: [], blockedBy: [] });
});

test('extractLinks: multiple Blocks links accumulate both directions', () => {
  const fields = {
    issuelinks: [
      { type: { name: 'Blocks' }, outwardIssue: { key: 'A', fields: { summary: 'a' } } },
      { type: { name: 'Blocks' }, outwardIssue: { key: 'B', fields: { summary: 'b' } } },
      { type: { name: 'Blocks' }, inwardIssue: { key: 'C', fields: { summary: 'c' } } },
    ],
  };
  const result = extractLinks(fields);
  // outward는 blockedBy(그들이 나를 blocks), inward는 blocks(내가 그를 blocks).
  assert.equal(result.blockedBy.length, 2);
  assert.equal(result.blocks.length, 1);
  assert.deepEqual(result.blockedBy.map((b) => b.key), ['A', 'B']);
  assert.equal(result.blocks[0].key, 'C');
});
