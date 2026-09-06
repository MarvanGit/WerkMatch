// A conversation is one evaluation or tailoring request, including its retries.
export async function requestOpenCode(
  body: Record<string, unknown>,
  sessionId: string = crypto.randomUUID(),
): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENCODE_GO_API_KEY;
  if (!apiKey) throw new Error('OPENCODE_GO_API_KEY is not configured.');
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('https://opencode.ai/zen/go/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WerkMatch/0.1 (+https://github.com/MarvanGit/WerkMatch)',
        'x-opencode-session': sessionId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (attempt < 2 && [429, 502, 503, 504].includes(response.status)) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              30_000,
              Math.max(1_000 * 2 ** attempt, retryAfter * 1_000 || 0),
            ),
          ),
        );
        continue;
      }
      throw new Error(
        `OpenCode request failed with status ${response.status}.`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
