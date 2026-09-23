import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOpenCode } from '../lib/ai/transport.ts';
import { databaseOperation, errorMessage } from '../lib/supabase/operation.ts';

void test('OpenCode keeps the same conversation ID across retries and separates new conversations', async () => {
  const previous = process.env.OPENCODE_GO_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENCODE_GO_API_KEY = 'test-only';
  const ids: string[] = [];
  globalThis.fetch = async (_url, init) => {
    ids.push(new Headers(init?.headers).get('x-opencode-session')!);
    return ids.length === 1
      ? new Response('gateway unavailable', { status: 503 })
      : Response.json({ output: [] });
  };
  try {
    await requestOpenCode({ model: 'test' });
    await requestOpenCode({ model: 'test' });
    await requestOpenCode({ model: 'test' }, 'werkmatch-document-request-1');
    assert.ok(ids[0]);
    assert.equal(ids[0], ids[1]);
    assert.notEqual(ids[1], ids[2]);
    assert.equal(ids[3], 'werkmatch-document-request-1');
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'OPENCODE_GO_API_KEY');
    else process.env.OPENCODE_GO_API_KEY = previous;
  }
});

void test('OpenCode reports a non-JSON HTTP error without masking it or retrying auth failures', async () => {
  const originalFetch = globalThis.fetch,
    previous = process.env.OPENCODE_GO_API_KEY;
  process.env.OPENCODE_GO_API_KEY = 'test-only';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('<html>Unauthorized</html>', { status: 401 });
  };
  try {
    await assert.rejects(requestOpenCode({}), /status 401/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined)
      Reflect.deleteProperty(process.env, 'OPENCODE_GO_API_KEY');
    else process.env.OPENCODE_GO_API_KEY = previous;
  }
});

void test('safe database operations recover from the observed connection reset', async () => {
  let calls = 0;
  const result = await databaseOperation(
    async () =>
      ++calls === 1
        ? {
            error: {
              message: 'TypeError: fetch failed',
              details: 'ECONNRESET',
            },
            data: null,
          }
        : { error: null, data: 'ok' },
    'Requeue stale requests',
    true,
  );
  assert.equal(calls, 2);
  assert.equal(result.data, 'ok');
});

void test('safe database reads retry a transient Cloudflare 522 response', async () => {
  let calls = 0;
  const result = await databaseOperation(
    async () =>
      ++calls === 1
        ? {
            error: {
              message: '<title>supabase.co | 522: Connection timed out</title>',
            },
            data: null,
          }
        : { error: null, data: [{ user_id: 'test-user' }] },
    'Read search schedules',
    true,
  );
  assert.equal(calls, 2);
  assert.deepEqual(result.data, [{ user_id: 'test-user' }]);
});

void test('database claims are not replayed and plain errors retain context', async () => {
  let calls = 0;
  await assert.rejects(
    databaseOperation(async () => {
      calls++;
      return { error: { message: 'TypeError: fetch failed' } };
    }, 'Claim request'),
    /Claim request: TypeError: fetch failed/,
  );
  assert.equal(calls, 1);
  assert.equal(
    errorMessage({ code: '23505', message: 'duplicate key' }),
    '23505: duplicate key',
  );
});

void test('permanent database errors are never retried', async () => {
  let calls = 0;
  await assert.rejects(
    databaseOperation(
      async () => {
        calls++;
        return { error: { code: '23505', message: 'duplicate key' } };
      },
      'Save jobs',
      true,
    ),
    /Save jobs: 23505/,
  );
  assert.equal(calls, 1);
});
