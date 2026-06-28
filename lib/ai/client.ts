import 'server-only';
import { getAnthropicApiKey } from '@/lib/store/secrets';
import { MODELS, type AiModel } from './models';

async function loadSdk() {
  try {
    return (await import('@anthropic-ai/sdk')).default;
  } catch {
    return null;
  }
}

export interface AiCallResult {
  ok: boolean;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export async function callModel(
  model: AiModel,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024
): Promise<AiCallResult> {
  const key = await getAnthropicApiKey();
  if (!key) {
    return { ok: false, error: 'No Anthropic API key set. Add one in Settings → AI.' };
  }
  const Anthropic = await loadSdk();
  if (!Anthropic) {
    return { ok: false, error: 'Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk' };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const resp = await client.messages.create({
      model: MODELS[model].id,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n');
    return {
      ok: true,
      text,
      inputTokens: resp.usage?.input_tokens,
      outputTokens: resp.usage?.output_tokens,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const safe = msg.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[key redacted]');
    return { ok: false, error: safe };
  }
}

export async function testConnection(model: AiModel): Promise<AiCallResult> {
  return callModel(model, 'Reply with the single word: ok', 'ping', 16);
}
