const WORKER_URL = import.meta.env.VITE_STRAVA_OAUTH_WORKER as string | undefined ?? '';

export interface CoachRequest {
  athleteId: number;
  context: string;
  question: string;
  model?: string;
}

export async function* streamCoachReply(
  req: CoachRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${WORKER_URL}/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(json.error ?? `AI request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as { text?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) yield parsed.text;
      } catch (e) {
        if (e instanceof SyntaxError) continue; // incomplete SSE frame — skip
        throw e;
      }
    }
  }
}
