import 'server-only';
import { callModel } from './client';
import type { AiModel } from './models';

const SYSTEM = `You are a strength and conditioning coach for distance runners. Produce one specific,
ready-to-follow session. Give it a title, total duration, and an ordered sequence of movements with
durations or reps. Tailor to the athlete's modality preference and current freshness — easier and
mobility-led when fatigued, more loading when fresh. No emojis. Under 250 words.`;

export interface SessionContentInput {
  sessionType: 'cross' | 'strength';
  modality: string;
  durationMin: number | null;
  tsb: number | null;
  formClass: string | null;
  activeInjuries: string[];
}

export function buildSessionPrompt(i: SessionContentInput): string {
  return [
    `Session slot: ${i.sessionType}`,
    `Preferred modality: ${i.modality}`,
    i.durationMin ? `Target duration: ~${i.durationMin} min` : 'Target duration: ~30 min',
    i.tsb != null ? `Current TSB: ${i.tsb} (${i.formClass ?? 'unknown form'})` : 'Freshness: unknown',
    i.activeInjuries.length
      ? `Work around: ${i.activeInjuries.join('; ')}`
      : 'No active injuries.',
    '',
    'Generate the session.',
  ].join('\n');
}

export async function generateSessionContent(i: SessionContentInput, model: AiModel) {
  return callModel(model, SYSTEM, buildSessionPrompt(i), 600);
}
