import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import {
  chicagoToday,
  isOverdueWake,
  isSnoozed,
  isTruncatedPage,
  SNOOZED_FETCH_LIMIT,
  isValidSnoozeDate,
  mergeOverdueWakes,
  parseSnoozeUntilFlag,
  registerWorkItems,
  snoozeCheckFailedSummary,
  snoozeUntil,
  sortBySnoozeWake,
  summarizeSnoozed,
  type WorkItem,
} from '../work-items.js';

// ---------------------------------------------------------------------------
// Snooze until a date, then wake: `cc wi snooze`, `cc wi wake`,
// `cc wi list --snoozed`, and the fail-safe on the default `cc wi list`.
//
// The Command Center app's daily job wakes a snoozed item on its date. If
// that job ever does not run, nothing errors: a tripwire just never comes
// back. So the default list re-checks every time and prints a snoozed item
// whose date has passed as OVERDUE WAKE. That fail-safe is the main thing
// these tests hold in place.
// ---------------------------------------------------------------------------

const ID_OPEN = '30000000-0000-4000-8000-000000000001';
const ID_OVERDUE = '30000000-0000-4000-8000-000000000002';
const ID_FUTURE = '30000000-0000-4000-8000-000000000003';
const ID_PLAIN = '30000000-0000-4000-8000-000000000004';
const ID_SOONER = '30000000-0000-4000-8000-000000000005';

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 'id', title: 'title', status: 'triaged', project: 'gt-ops',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as WorkItem;
}

function snoozedItem(id: string, until: unknown, fromStatus = 'approved'): WorkItem {
  return item({
    id, title: `TRIPWIRE ${String(until)}`, status: 'deferred',
    metadata: { snooze: { until, from_status: fromStatus, by: 'clay', at: '2026-10-13T15:00:00.000Z' } },
  });
}

// --- pure rules -------------------------------------------------------------

test('chicagoToday: the day changes at Chicago midnight, in daylight time and in standard time', () => {
  assert.equal(chicagoToday(new Date('2026-10-14T04:59:59Z')), '2026-10-13');
  assert.equal(chicagoToday(new Date('2026-10-14T05:00:00Z')), '2026-10-14');
  assert.equal(chicagoToday(new Date('2027-01-29T05:59:59Z')), '2027-01-28');
  assert.equal(chicagoToday(new Date('2027-01-29T06:00:00Z')), '2027-01-29');
});

test('isValidSnoozeDate: only a real calendar date written YYYY-MM-DD', () => {
  assert.equal(isValidSnoozeDate('2027-01-29'), true);
  for (const bad of ['2027-02-29', '2026-13-01', '1/29/27', '2027-1-29', '', 'tomorrow', undefined, null]) {
    assert.equal(isValidSnoozeDate(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

test('parseSnoozeUntilFlag: a future date is accepted and trimmed', () => {
  assert.equal(parseSnoozeUntilFlag('2027-01-29', '2026-10-13'), '2027-01-29');
  assert.equal(parseSnoozeUntilFlag(' 2026-10-14 ', '2026-10-13'), '2026-10-14');
});

test('parseSnoozeUntilFlag: a missing date is rejected', () => {
  for (const raw of [undefined, '', '   ']) {
    assert.throws(() => parseSnoozeUntilFlag(raw, '2026-10-13'), /--until is required/);
  }
});

test('parseSnoozeUntilFlag: anything that is not a real YYYY-MM-DD date is rejected', () => {
  for (const raw of ['1/29/27', '2027-02-30', 'next week', '2027-01-29T00:00:00Z', '20270129']) {
    assert.throws(() => parseSnoozeUntilFlag(raw, '2026-10-13'), /must be a real date written YYYY-MM-DD/, raw);
  }
});

test('parseSnoozeUntilFlag: a past date and today are rejected', () => {
  assert.throws(() => parseSnoozeUntilFlag('2026-10-12', '2026-10-13'), /must be after today/);
  assert.throws(() => parseSnoozeUntilFlag('2020-01-01', '2026-10-13'), /must be after today/);
  assert.throws(() => parseSnoozeUntilFlag('2026-10-13', '2026-10-13'), /must be after today/);
});

test('isSnoozed: deferred AND carrying metadata.snooze. A plain deferred item is not snoozed', () => {
  assert.equal(isSnoozed(snoozedItem(ID_FUTURE, '2027-01-29')), true);
  assert.equal(isSnoozed(item({ status: 'deferred' })), false);
  assert.equal(isSnoozed(item({ status: 'deferred', metadata: {} })), false);
  assert.equal(isSnoozed(item({ status: 'deferred', metadata: { snooze: null } })), false);
  assert.equal(isSnoozed(item({ status: 'deferred', metadata: { last_snooze: { until: '2026-01-01' } } })), false);
  // A stale snooze on an item that is open again does not count.
  assert.equal(isSnoozed({ ...snoozedItem(ID_FUTURE, '2027-01-29'), status: 'in_progress' }), false);
});

test('isOverdueWake: due on the date and after it, not before; never for a plain deferred item', () => {
  assert.equal(isOverdueWake(snoozedItem(ID_OVERDUE, '2026-10-13'), '2026-10-13'), true);
  assert.equal(isOverdueWake(snoozedItem(ID_OVERDUE, '2026-09-01'), '2026-10-13'), true);
  assert.equal(isOverdueWake(snoozedItem(ID_FUTURE, '2026-10-14'), '2026-10-13'), false);
  assert.equal(isOverdueWake(item({ status: 'deferred' }), '2026-10-13'), false);
});

test('isOverdueWake: a snooze whose date cannot be read is overdue, because it could never come due', () => {
  const broken = snoozedItem(ID_OVERDUE, 'sometime in January');
  assert.equal(snoozeUntil(broken), null);
  assert.equal(isOverdueWake(broken, '2026-10-13'), true);
});

test('sortBySnoozeWake: soonest wake first, and non-snoozed items are dropped', () => {
  const sorted = sortBySnoozeWake([
    snoozedItem(ID_FUTURE, '2027-03-01'),
    item({ id: ID_PLAIN, status: 'deferred' }),
    snoozedItem(ID_SOONER, '2026-11-01'),
    snoozedItem(ID_OVERDUE, '2026-09-01'),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), [ID_OVERDUE, ID_SOONER, ID_FUTURE]);
});

test('summarizeSnoozed: count, the next wake still ahead, and the overdue count', () => {
  const summary = summarizeSnoozed([
    snoozedItem(ID_FUTURE, '2027-03-01'),
    snoozedItem(ID_SOONER, '2026-11-01'),
    snoozedItem(ID_OVERDUE, '2026-09-01'),
    item({ id: ID_PLAIN, status: 'deferred' }),
  ], '2026-10-13');
  assert.equal(summary.count, 3);
  assert.equal(summary.next_wake, '2026-11-01');
  assert.equal(summary.overdue_count, 1);
  assert.equal(summary.checked, true);
  assert.match(summary.line, /^Snoozed: 3 items, next wake 2026-11-01\. 1 OVERDUE WAKE/);
});

test('summarizeSnoozed: plain lines when nothing is overdue and when nothing is snoozed', () => {
  assert.equal(summarizeSnoozed([snoozedItem(ID_FUTURE, '2027-03-01')], '2026-10-13').line, 'Snoozed: 1 item, next wake 2027-03-01');
  assert.equal(summarizeSnoozed([], '2026-10-13').line, 'Snoozed: 0 items');
  assert.equal(summarizeSnoozed([item({ status: 'deferred' })], '2026-10-13').count, 0);
});

test('mergeOverdueWakes: overdue snoozed items go to the top, flagged; future and plain deferred items are not added', () => {
  const open = [item({ id: ID_OPEN })];
  const merged = mergeOverdueWakes(open, [
    snoozedItem(ID_FUTURE, '2027-03-01'),
    snoozedItem(ID_OVERDUE, '2026-09-01'),
    item({ id: ID_PLAIN, status: 'deferred' }),
  ], '2026-10-13');
  assert.deepEqual(merged.map((i) => [i.id, i.overdue_wake ?? false]), [[ID_OVERDUE, true], [ID_OPEN, false]]);
});

test('mergeOverdueWakes: an item already in the list is flagged once, not listed twice; nothing overdue returns the list untouched', () => {
  const overdue = snoozedItem(ID_OVERDUE, '2026-09-01');
  const merged = mergeOverdueWakes([item({ id: ID_OPEN }), overdue], [overdue], '2026-10-13');
  assert.deepEqual(merged.map((i) => i.id), [ID_OVERDUE, ID_OPEN]);
  assert.equal(merged[0].overdue_wake, true);

  const open = [item({ id: ID_OPEN })];
  assert.equal(mergeOverdueWakes(open, [snoozedItem(ID_FUTURE, '2027-03-01')], '2026-10-13'), open);
});

test('snoozeCheckFailedSummary: says the check did not run', () => {
  const summary = snoozeCheckFailedSummary('API 500');
  assert.equal(summary.checked, false);
  assert.match(summary.line, /CHECK FAILED \(API 500\)/);
});

// --- the commands, with the Command Center API faked ------------------------

type Call = { method: string; path: string; search: URLSearchParams; body: Record<string, unknown> | null };
type Reply = { status?: number; json: unknown };

class ExitSignal extends Error {
  constructor(public code: number) { super(`process.exit(${code})`); }
}

/**
 * Run one `cc wi ...` command. Under `node --test` stdout is not a TTY, so the
 * CLI is in agent mode and prints one JSON envelope, which is what Claude
 * reads in real use.
 */
async function runWi(
  t: { mock: { method: (...args: any[]) => any } },
  args: string[],
  reply: (call: Call) => Reply,
): Promise<{ calls: Call[]; envelope: any; exitCode: number | null }> {
  process.env.COMMAND_CENTER_API_KEY = 'fixture-not-a-real-credential';
  process.env.COMMAND_CENTER_URL = 'https://cc-fixture.invalid';

  const calls: Call[] = [];
  const logged: string[] = [];
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://cc-fixture.invalid', 'no call may leave the fixture');
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const { status = 200, json } = reply(call);
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  });
  const logMock = t.mock.method(console, 'log', (line: string) => { logged.push(String(line)); });
  const errMock = t.mock.method(console, 'error', () => {});
  const exitMock = t.mock.method(process, 'exit', (code?: number) => { throw new ExitSignal(code ?? 0); });

  const program = new Command();
  program.name('cc').option('--url <url>').exitOverride();
  registerWorkItems(program);

  let exitCode: number | null = null;
  try {
    await program.parseAsync(['node', 'cc', 'wi', ...args]);
  } catch (err) {
    if (err instanceof ExitSignal) exitCode = err.code;
    else throw err;
  } finally {
    fetchMock.mock.restore();
    logMock.mock.restore();
    errMock.mock.restore();
    exitMock.mock.restore();
  }

  return { calls, envelope: logged.length ? JSON.parse(logged[logged.length - 1]) : null, exitCode };
}

const OPEN_ITEMS = [item({ id: ID_OPEN, title: 'An open task' })];
// What an older deploy would send back for the snoozed query: every deferred
// item, snoozed or not. The CLI must still pick out only the snoozed ones.
const DEFERRED_ITEMS = [
  snoozedItem(ID_FUTURE, '2999-03-01'),
  snoozedItem(ID_OVERDUE, '2000-01-01'),
  item({ id: ID_PLAIN, title: 'Plain deferred, never snoozed', status: 'deferred', metadata: {} }),
  snoozedItem(ID_SOONER, '2999-01-01', 'in_progress'),
];

function listReplies(call: Call): Reply {
  if (call.search.get('snoozed') === 'true') return { json: { items: DEFERRED_ITEMS, count: DEFERRED_ITEMS.length } };
  return { json: { items: OPEN_ITEMS, count: OPEN_ITEMS.length } };
}

test('cc wi list: the default list adds an overdue snoozed item at the top, marked, with the summary line', async (t) => {
  const { calls, envelope } = await runWi(t, ['list'], listReplies);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].search.get('status'), 'discovered,triaged,approved,in_progress,review');
  assert.equal(calls[1].search.get('snoozed'), 'true');
  assert.equal(calls[1].search.get('status'), 'deferred');

  const result = envelope.result;
  assert.deepEqual(result.items.map((i: WorkItem) => [i.id, i.overdue_wake ?? false]), [[ID_OVERDUE, true], [ID_OPEN, false]]);
  assert.equal(result.count, 2);
  assert.deepEqual(
    { count: result.snooze_summary.count, next_wake: result.snooze_summary.next_wake, overdue_count: result.snooze_summary.overdue_count, checked: result.snooze_summary.checked },
    { count: 3, next_wake: '2999-01-01', overdue_count: 1, checked: true },
  );
  assert.match(result.snooze_summary.line, /^Snoozed: 3 items, next wake 2999-01-01\. 1 OVERDUE WAKE/);
});

test('cc wi list: a plain deferred item never appears on the default list', async (t) => {
  const { envelope } = await runWi(t, ['list'], listReplies);
  assert.ok(!envelope.result.items.some((i: WorkItem) => i.id === ID_PLAIN));
  assert.ok(!envelope.result.items.some((i: WorkItem) => i.id === ID_FUTURE));
});

test('cc wi list: with nothing overdue the list is unchanged and the summary line still prints', async (t) => {
  const { envelope } = await runWi(t, ['list'], (call) => call.search.get('snoozed') === 'true'
    ? { json: { items: [snoozedItem(ID_FUTURE, '2999-03-01')], count: 1 } }
    : { json: { items: OPEN_ITEMS, count: 1 } });
  assert.deepEqual(envelope.result.items.map((i: WorkItem) => i.id), [ID_OPEN]);
  assert.equal(envelope.result.snooze_summary.line, 'Snoozed: 1 item, next wake 2999-03-01');
});

test('cc wi list: if the snoozed check fails, the list still prints and says the check failed', async (t) => {
  const { envelope, exitCode } = await runWi(t, ['list'], (call) => call.search.get('snoozed') === 'true'
    ? { status: 500, json: { error: 'fixture outage' } }
    : { json: { items: OPEN_ITEMS, count: 1 } });
  assert.equal(exitCode, null);
  assert.equal(envelope.ok, true);
  assert.deepEqual(envelope.result.items.map((i: WorkItem) => i.id), [ID_OPEN]);
  assert.equal(envelope.result.snooze_summary.checked, false);
  assert.match(envelope.result.snooze_summary.line, /CHECK FAILED \(API 500\)/);
});

test('cc wi list --status: an explicit status filter is left exactly as asked, with no snooze check', async (t) => {
  const { calls, envelope } = await runWi(t, ['list', '--status', 'done'], listReplies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].search.get('status'), 'done');
  assert.equal(envelope.result.snooze_summary, undefined);
});

test('cc wi list --snoozed: snoozed items only, soonest wake first, overdue flagged', async (t) => {
  const { calls, envelope } = await runWi(t, ['list', '--snoozed'], listReplies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].search.get('snoozed'), 'true');
  assert.deepEqual(
    envelope.result.items.map((i: WorkItem) => [i.id, i.overdue_wake ?? false]),
    [[ID_OVERDUE, true], [ID_SOONER, false], [ID_FUTURE, false]],
  );
  assert.equal(envelope.result.count, 3);
  assert.equal(envelope.result.snooze_summary.next_wake, '2999-01-01');
});

// --- the API's page cap ------------------------------------------------------
// GET /api/work-items clamps `limit` to 200 and has no offset, so the CLI cannot
// see past 200 snoozed items. The daily wake job reads up to 1000. The CLI asks
// for exactly what the API allows, and says so out loud when a page comes back
// full, because the API drops the oldest items when it cuts a page short.

function manySnoozed(n: number): WorkItem[] {
  return Array.from({ length: n }, (_, i) => snoozedItem(
    `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    // Dates are all in the future so nothing is overdue and only the cap matters.
    `2999-${String((i % 12) + 1).padStart(2, '0')}-15`,
  ));
}

test('SNOOZED_FETCH_LIMIT is the API maximum, 200, and only a full page counts as cut off', () => {
  assert.equal(SNOOZED_FETCH_LIMIT, 200);
  assert.equal(isTruncatedPage(0), false);
  assert.equal(isTruncatedPage(199), false);
  assert.equal(isTruncatedPage(200), true);
  assert.equal(isTruncatedPage(201), true);
});

test('summarizeSnoozed: a cut-off page adds a loud warning and sets truncated', () => {
  const cut = summarizeSnoozed([snoozedItem(ID_FUTURE, '2999-03-01')], '2026-10-13', true);
  assert.equal(cut.truncated, true);
  assert.match(cut.line, /^Snoozed: 1 item, next wake 2999-03-01\. WARNING: the API sent its 200-item maximum/);
  const whole = summarizeSnoozed([snoozedItem(ID_FUTURE, '2999-03-01')], '2026-10-13');
  assert.equal(whole.truncated, false);
  assert.ok(!/WARNING/.test(whole.line));
  assert.equal(snoozeCheckFailedSummary('API 500').truncated, false);
});

test('cc wi list and cc wi list --snoozed: both ask the API for its maximum page, 200', async (t) => {
  const asDefault = await runWi(t, ['list'], listReplies);
  assert.equal(asDefault.calls[1].search.get('snoozed'), 'true');
  assert.equal(asDefault.calls[1].search.get('limit'), '200');
  const asSnoozed = await runWi(t, ['list', '--snoozed'], listReplies);
  assert.equal(asSnoozed.calls[0].search.get('limit'), '200');
});

test('cc wi list: a full page of 200 snoozed items is flagged as possibly cut off, on both commands', async (t) => {
  const full = manySnoozed(200);
  const reply = (call: Call): Reply => call.search.get('snoozed') === 'true'
    ? { json: { items: full, count: full.length } }
    : { json: { items: OPEN_ITEMS, count: 1 } };

  const asDefault = await runWi(t, ['list'], reply);
  assert.equal(asDefault.envelope.result.snooze_summary.truncated, true);
  assert.equal(asDefault.envelope.result.snooze_summary.count, 200);
  assert.match(asDefault.envelope.result.snooze_summary.line, /WARNING: the API sent its 200-item maximum/);

  const asSnoozed = await runWi(t, ['list', '--snoozed'], reply);
  assert.equal(asSnoozed.envelope.result.snooze_summary.truncated, true);
  assert.match(asSnoozed.envelope.result.snooze_summary.line, /WARNING/);
});

test('cc wi list: 199 snoozed items is a whole page, with no warning', async (t) => {
  const some = manySnoozed(199);
  const { envelope } = await runWi(t, ['list'], (call) => call.search.get('snoozed') === 'true'
    ? { json: { items: some, count: some.length } }
    : { json: { items: OPEN_ITEMS, count: 1 } });
  assert.equal(envelope.result.snooze_summary.truncated, false);
  assert.ok(!/WARNING/.test(envelope.result.snooze_summary.line));
});

test('cc wi snooze: sends the snooze operation with the date, and the reason under `reason` (never `notes`)', async (t) => {
  const { calls, envelope, exitCode } = await runWi(
    t,
    ['snooze', '-i', ID_OPEN, '--until', '2999-01-29', '--notes', 'Publix review opens'],
    () => ({ json: { item: { id: ID_OPEN, status: 'deferred' }, snooze: { until: '2999-01-29', from_status: 'triaged', by: 'clay', at: 'x' } } }),
  );
  assert.equal(exitCode, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].path, '/api/work-items');
  assert.deepEqual(calls[0].body, { id: ID_OPEN, operation: 'snooze', until: '2999-01-29', reason: 'Publix review opens', actor: 'clay' });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.snooze.until, '2999-01-29');
});

test('cc wi snooze: a past, malformed or impossible date exits 1 before any request is made', async (t) => {
  for (const until of ['2000-01-01', '1/29/2999', '2999-02-30', 'soon', chicagoToday()]) {
    const { calls, envelope, exitCode } = await runWi(t, ['snooze', '-i', ID_OPEN, '--until', until], () => ({ json: {} }));
    assert.equal(exitCode, 1, until);
    assert.equal(calls.length, 0, until);
    assert.equal(envelope.ok, false, until);
  }
});

test('cc wi snooze: --until is required', async (t) => {
  // commander refuses the command itself; exitOverride turns that into a throw.
  await assert.rejects(runWi(t, ['snooze', '-i', ID_OPEN], () => ({ json: {} })), /--until/);
});

test('cc wi snooze: a 200 that does not confirm the snooze is reported as NOT snoozed', async (t) => {
  // What a deploy without the snooze operation could answer for some other payload.
  const { envelope, exitCode } = await runWi(
    t,
    ['snooze', '-i', ID_OPEN, '--until', '2999-01-29'],
    () => ({ json: { updated: [ID_OPEN], item: { id: ID_OPEN, status: 'triaged' } } }),
  );
  assert.equal(exitCode, 1);
  assert.equal(envelope.ok, false);
  assert.match(envelope.error.message, /NOT snoozed/);
});

test('cc wi snooze: a server refusal (422 past date, 400 old deploy) exits 1 with the server message', async (t) => {
  for (const status of [400, 422]) {
    const { envelope, exitCode } = await runWi(
      t,
      ['snooze', '-i', ID_OPEN, '--until', '2999-01-29'],
      () => ({ status, json: { error: 'fixture refusal' } }),
    );
    assert.equal(exitCode, 1);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, String(status));
  }
});

test('cc wi wake: sends the wake operation and reports the status the item returned to', async (t) => {
  const { calls, envelope, exitCode } = await runWi(
    t,
    ['wake', '-i', ID_FUTURE],
    () => ({ json: { item: { id: ID_FUTURE, status: 'approved' }, woke: true } }),
  );
  assert.equal(exitCode, null);
  assert.deepEqual(calls[0].body, { id: ID_FUTURE, operation: 'wake', actor: 'clay' });
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(envelope.result.item.status, 'approved');
});

test('cc wi wake: a 200 that does not confirm the wake is reported as NOT woken', async (t) => {
  const { envelope, exitCode } = await runWi(
    t,
    ['wake', '-i', ID_FUTURE],
    () => ({ json: { item: { id: ID_FUTURE, status: 'deferred' } } }),
  );
  assert.equal(exitCode, 1);
  assert.match(envelope.error.message, /NOT woken/);
});
