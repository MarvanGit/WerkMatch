import assert from 'node:assert/strict';
import test from 'node:test';

import { triggerDocumentWorker } from '../lib/workers/github.ts';

void test('reports when immediate GitHub dispatch is not configured', async () => {
  const previousToken = process.env.GITHUB_WORKER_TOKEN;
  delete process.env.GITHUB_WORKER_TOKEN;
  try {
    assert.deepEqual(await triggerDocumentWorker(), {
      triggered: false,
      reason: 'not_configured',
    });
  } finally {
    restore('GITHUB_WORKER_TOKEN', previousToken);
  }
});

void test('dispatches the document workflow on the configured branch', async () => {
  const previous = {
    token: process.env.GITHUB_WORKER_TOKEN,
    repository: process.env.GITHUB_WORKER_REPOSITORY,
    workflow: process.env.GITHUB_DOCUMENT_WORKFLOW,
    branch: process.env.GITHUB_WORKER_BRANCH,
  };
  process.env.GITHUB_WORKER_TOKEN = 'test-token';
  process.env.GITHUB_WORKER_REPOSITORY = 'Example/WerkMatch';
  process.env.GITHUB_DOCUMENT_WORKFLOW = 'documents.yml';
  process.env.GITHUB_WORKER_BRANCH = 'production';

  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    capturedInit = init;
    return new Response(null, { status: 204 });
  };

  try {
    assert.deepEqual(await triggerDocumentWorker(fakeFetch), {
      triggered: true,
    });
    assert.equal(
      capturedUrl,
      'https://api.github.com/repos/Example/WerkMatch/actions/workflows/documents.yml/dispatches',
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.body, JSON.stringify({ ref: 'production' }));
    assert.equal(
      new Headers(capturedInit?.headers).get('Authorization'),
      'Bearer test-token',
    );
  } finally {
    restore('GITHUB_WORKER_TOKEN', previous.token);
    restore('GITHUB_WORKER_REPOSITORY', previous.repository);
    restore('GITHUB_DOCUMENT_WORKFLOW', previous.workflow);
    restore('GITHUB_WORKER_BRANCH', previous.branch);
  }
});

void test('fails without exposing the GitHub response body', async () => {
  const previousToken = process.env.GITHUB_WORKER_TOKEN;
  process.env.GITHUB_WORKER_TOKEN = 'secret-token';
  try {
    await assert.rejects(
      triggerDocumentWorker(
        async () => new Response('sensitive response', { status: 403 }),
      ),
      /GitHub rejected the document-worker dispatch \(403\)/,
    );
  } finally {
    restore('GITHUB_WORKER_TOKEN', previousToken);
  }
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
