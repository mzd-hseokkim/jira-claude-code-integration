'use strict';

/**
 * metrics-routes.test.js — MAE-386 Test Plan T3
 *
 * T3: GET /metrics → 선택 스페이스의 status 분포·주별 throughput JSON 반환
 *     GET /spaces → 선택기용 스페이스 목록 반환
 *
 * express는 런타임 의존이므로 require.cache에 mock을 등록한다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Minimal express stub — inject into require.cache before loading routes
// ---------------------------------------------------------------------------

function makeExpressMock() {
  const stub = function express() {};
  stub.Router = function Router() {
    const r = { stack: [] };
    r.get = function (routePath, fn) {
      r.stack.push({ route: { stack: [{ handle: fn }] } });
      return r;
    };
    return r;
  };
  return stub;
}

// Patch Module._load to intercept 'express' for the lifetime of this test file.
// Routes use lazy require('express') inside factory functions, so the patch must
// remain active throughout all test() calls.
const Module = require('node:module');
const expressMock = makeExpressMock();
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'express') return expressMock;
  return origLoad.call(this, request, parent, isMain);
};

const { createMetricsRouter } = require('../routes/metrics');
const { createSpacesRouter } = require('../routes/spaces');

// NOTE: intentionally NOT restoring Module._load — patch must stay active
// so createMetricsRouter()/createSpacesRouter() can call require('express') lazily.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(query = {}) {
  return { query };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { res._status = code; return res; },
    json(body) { res._body = body; return res; },
  };
  return res;
}

function getHandler(router) {
  const layer = router.stack.find((l) => l.route);
  assert.ok(layer, 'router should have a route');
  return layer.route.stack[0].handle;
}

// ---------------------------------------------------------------------------
// Mock store
// ---------------------------------------------------------------------------

function makeStore(overrides = {}) {
  return {
    listSpaces: overrides.listSpaces ?? (() => [
      { id: 'sp1', site: 'https://x.atlassian.net', projectKey: 'MAE', credsOk: true, addedAt: '2024-01-01' },
    ]),
    getStatusDistribution: overrides.getStatusDistribution ?? (() => [
      { status: 'In Progress', statusCategory: 'indeterminate', count: 3 },
      { status: 'Done', statusCategory: 'done', count: 5 },
    ]),
    getThroughput: overrides.getThroughput ?? (() => [
      { week: '2024-01', completed: 2 },
    ]),
    getWip: overrides.getWip ?? (() => 3),
    getLeadTime: overrides.getLeadTime ?? (() => ({ median: 10, p75: 15, p95: 20, distribution: [{ issueKey: 'MAE-1', days: 10 }] })),
    getCycleTime: overrides.getCycleTime ?? (() => ({ median: 5, p75: 8, p95: 12, distribution: [{ issueKey: 'MAE-1', days: 5 }], note: '근사값' })),
    getPerAssignee: overrides.getPerAssignee ?? (() => [{ assignee: 'alice', completed: 2, wip: 1 }]),
    getAgingWip: overrides.getAgingWip ?? (() => [{ issueKey: 'MAE-2', summary: 'Old issue', assignee: 'bob', created: '2024-01-01', ageDays: 30 }]),
  };
}

// ---------------------------------------------------------------------------
// T3: GET /metrics
// ---------------------------------------------------------------------------

test('T3: GET /metrics returns status distribution, wip, throughput for valid space', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const req = makeReq({ space: 'sp1', weeks: '4' });
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.spaceId, 'sp1');
  assert.equal(res._body.weeks, 4);
  assert.ok(Array.isArray(res._body.statusDistribution), 'statusDistribution should be array');
  assert.ok(Array.isArray(res._body.throughput), 'throughput should be array');
  assert.equal(typeof res._body.wip, 'number', 'wip should be number');
});

test('T3: GET /metrics returns 400 when space param missing', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const req = makeReq({});
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 400);
  assert.ok(res._body.error, 'error field should exist');
});

test('T3: GET /metrics defaults weeks to 8 when not provided', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const req = makeReq({ space: 'sp1' });
  const res = makeRes();

  handler(req, res);

  assert.equal(res._body.weeks, 8, 'default weeks should be 8');
});

test('T3: GET /metrics returns 500 when store throws', () => {
  const store = makeStore({
    getStatusDistribution: () => { throw new Error('db error'); },
  });
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const req = makeReq({ space: 'sp1' });
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 500);
  assert.ok(res._body.error, 'error field should exist');
});

// ---------------------------------------------------------------------------
// T3: GET /spaces
// ---------------------------------------------------------------------------

test('T3: GET /spaces returns spaces array', () => {
  const store = makeStore();
  const router = createSpacesRouter(store);
  const handler = getHandler(router);

  const req = makeReq();
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 200);
  assert.ok(Array.isArray(res._body.spaces), 'spaces should be array');
  assert.equal(res._body.spaces.length, 1);
  assert.equal(res._body.spaces[0].id, 'sp1');
});

test('T3: GET /spaces returns 500 when store throws', () => {
  const store = makeStore({
    listSpaces: () => { throw new Error('fail'); },
  });
  const router = createSpacesRouter(store);
  const handler = getHandler(router);

  const req = makeReq();
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 500);
  assert.ok(res._body.error, 'error field should exist');
});

// ---------------------------------------------------------------------------
// MAE-387 T5: 신규 4필드 존재 + 기존 4필드 유지 (하위 호환)
// ---------------------------------------------------------------------------

test('T5: GET /metrics response includes MAE-387 new fields (leadTime, cycleTime, perAssignee, agingWip)', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const req = makeReq({ space: 'sp1' });
  const res = makeRes();

  handler(req, res);

  assert.equal(res._status, 200);

  // 기존 4필드 (하위 호환)
  assert.ok('statusDistribution' in res._body, 'statusDistribution should exist');
  assert.ok('wip' in res._body, 'wip should exist');
  assert.ok('throughput' in res._body, 'throughput should exist');
  assert.ok('spaceId' in res._body, 'spaceId should exist');

  // 신규 4필드 (MAE-387)
  assert.ok('leadTime' in res._body, 'leadTime should exist');
  assert.ok('cycleTime' in res._body, 'cycleTime should exist');
  assert.ok('perAssignee' in res._body, 'perAssignee should exist');
  assert.ok('agingWip' in res._body, 'agingWip should exist');
});

test('T5: GET /metrics leadTime field has correct shape', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  handler(makeReq({ space: 'sp1' }), makeRes());
  const res = makeRes();
  handler(makeReq({ space: 'sp1' }), res);

  const lt = res._body.leadTime;
  assert.ok(lt !== undefined, 'leadTime should not be undefined');
  assert.ok('median' in lt, 'leadTime.median should exist');
  assert.ok('distribution' in lt, 'leadTime.distribution should exist');
  assert.ok(Array.isArray(lt.distribution), 'leadTime.distribution should be array');
});

test('T5: GET /metrics perAssignee field is an array', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const res = makeRes();
  handler(makeReq({ space: 'sp1' }), res);

  assert.ok(Array.isArray(res._body.perAssignee), 'perAssignee should be array');
  if (res._body.perAssignee.length > 0) {
    const first = res._body.perAssignee[0];
    assert.ok('assignee' in first, 'entry has assignee field');
    assert.ok('completed' in first, 'entry has completed field');
    assert.ok('wip' in first, 'entry has wip field');
  }
});

test('T5: GET /metrics agingWip field is an array', () => {
  const store = makeStore();
  const router = createMetricsRouter(store);
  const handler = getHandler(router);

  const res = makeRes();
  handler(makeReq({ space: 'sp1' }), res);

  assert.ok(Array.isArray(res._body.agingWip), 'agingWip should be array');
  if (res._body.agingWip.length > 0) {
    const first = res._body.agingWip[0];
    assert.ok('issueKey' in first, 'entry has issueKey field');
    assert.ok('ageDays' in first, 'entry has ageDays field');
  }
});
