export type WorkerDispatchResult =
  | { triggered: true }
  | { triggered: false; reason: 'not_configured' };

export async function triggerDocumentWorker(
  fetchImplementation: typeof fetch = fetch,
): Promise<WorkerDispatchResult> {
  const token = process.env.GITHUB_WORKER_TOKEN?.trim();
  if (!token) return { triggered: false, reason: 'not_configured' };

  const repository =
    process.env.GITHUB_WORKER_REPOSITORY?.trim() || 'MarvanGit/WerkMatch';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('The GitHub worker repository is invalid.');
  }
  const workflow =
    process.env.GITHUB_DOCUMENT_WORKFLOW?.trim() || 'document-worker.yml';
  const branch = process.env.GITHUB_WORKER_BRANCH?.trim() || 'main';

  const response = await fetchImplementation(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WerkMatch/0.1',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: branch }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub rejected the document-worker dispatch (${response.status}).`,
    );
  }
  return { triggered: true };
}
