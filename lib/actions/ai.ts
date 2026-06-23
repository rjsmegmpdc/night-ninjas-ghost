'use server';
import { revalidatePath } from 'next/cache';
import { setAnthropicApiKey, clearAnthropicApiKey, getAnthropicApiKey } from '@/lib/store/secrets';
import { getAiModel, setAiModel, getStrengthPreferences, type AiModel } from '@/lib/store/settings';
import { testConnection } from '@/lib/ai/client';
import { assembleSnapshot } from '@/lib/ai/context';
import { buildBriefingPrompt, generateBriefing } from '@/lib/ai/briefing';
import { snapshotToText } from '@/lib/ai/context-pure';
import { estimateCost } from '@/lib/ai/tokens';
import { generateSessionContent, buildSessionPrompt, type SessionContentInput } from '@/lib/ai/session-content';
import { MODELS } from '@/lib/ai/models';

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

export async function saveAnthropicKey(fd: FormData): Promise<SimpleResult> {
  const key = String(fd.get('apiKey') ?? '').trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  if (!key.startsWith('sk-ant-')) {
    return { ok: false, error: 'That does not look like an Anthropic key (expected sk-ant-…).' };
  }
  await setAnthropicApiKey(key);
  revalidatePath('/settings');
  return { ok: true };
}

export async function deleteAnthropicKey(): Promise<SimpleResult> {
  await clearAnthropicApiKey();
  revalidatePath('/settings');
  return { ok: true };
}

export async function saveAiModel(fd: FormData): Promise<SimpleResult> {
  const v = String(fd.get('model') ?? '');
  if (v !== 'haiku' && v !== 'sonnet') return { ok: false, error: 'Invalid model.' };
  await setAiModel(v as AiModel);
  revalidatePath('/settings');
  revalidatePath('/patrol');
  return { ok: true };
}

export async function testAnthropicConnection(): Promise<SimpleResult & { model?: string }> {
  const key = await getAnthropicApiKey();
  if (!key) return { ok: false, error: 'No key saved yet.' };
  const model = await getAiModel();
  const r = await testConnection(model);
  return r.ok ? { ok: true, model: MODELS[model].label } : { ok: false, error: r.error };
}

export interface BriefingResult {
  ok: boolean;
  text?: string;
  dataSent?: string;
  estInputTokens?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  error?: string;
}

export async function runDailyBriefing(): Promise<BriefingResult> {
  const key = await getAnthropicApiKey();
  if (!key) {
    return { ok: false, error: 'No Anthropic key set. Add one in Settings → AI.' };
  }
  const model = await getAiModel();
  const snapshot = await assembleSnapshot();
  const prompt = buildBriefingPrompt(snapshot);
  const dataSent = snapshotToText(snapshot);
  const est = estimateCost(prompt, model);
  const r = await generateBriefing(snapshot, model);
  if (!r.ok) {
    return { ok: false, error: r.error, dataSent, estInputTokens: est.inputTokens };
  }
  return {
    ok: true,
    text: r.text,
    dataSent,
    estInputTokens: est.inputTokens,
    actualInputTokens: r.inputTokens,
    actualOutputTokens: r.outputTokens,
  };
}

export interface SessionContentResult {
  ok: boolean;
  text?: string;
  dataSent?: string;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  error?: string;
}

export async function runSessionContent(fd: FormData): Promise<SessionContentResult> {
  const key = await getAnthropicApiKey();
  if (!key) {
    return { ok: false, error: 'No Anthropic key set. Add one in Settings → AI.' };
  }
  const rawType = String(fd.get('sessionType') ?? '');
  if (rawType !== 'cross' && rawType !== 'strength') {
    return { ok: false, error: 'Unsupported session type.' };
  }
  const sessionType = rawType as 'cross' | 'strength';
  const durationRaw = fd.get('durationMin');
  const model = await getAiModel();
  const [prefs, snapshot] = await Promise.all([getStrengthPreferences(), assembleSnapshot()]);
  const input: SessionContentInput = {
    sessionType,
    modality: prefs.modality,
    durationMin: durationRaw ? Number(durationRaw) : null,
    tsb: snapshot.state?.tsb ?? null,
    formClass: snapshot.state?.formClass ?? null,
    activeInjuries: snapshot.activeInjuries.map(
      (i) => `${i.bodyRegion ?? i.type} (${i.severity})`
    ),
  };
  const dataSent = buildSessionPrompt(input);
  const r = await generateSessionContent(input, model);
  if (!r.ok) return { ok: false, error: r.error, dataSent };
  return {
    ok: true,
    text: r.text,
    dataSent,
    actualInputTokens: r.inputTokens,
    actualOutputTokens: r.outputTokens,
  };
}
