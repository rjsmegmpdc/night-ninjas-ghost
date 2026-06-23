import 'server-only';
import { callModel } from './client';
import { snapshotToText, type AthleteSnapshot } from './context-pure';
import type { AiModel } from './models';

const SYSTEM = `You are an experienced, calm distance-running coach. You speak plainly, no hype.
Ground every statement in the athlete's data. If freshness is low (negative TSB) say so and adjust
expectations. Give a 3-paragraph briefing for today: (1) where the athlete stands right now,
(2) how to approach today's session given their state, (3) one thing to watch heading into the rest
of the week. No bullet lists. No emojis. Keep it under 220 words.`;

export function buildBriefingPrompt(snapshot: AthleteSnapshot): string {
  return `Here is the athlete's current state:\n\n${snapshotToText(snapshot)}\n\nWrite today's coach briefing.`;
}

export async function generateBriefing(snapshot: AthleteSnapshot, model: AiModel) {
  return callModel(model, SYSTEM, buildBriefingPrompt(snapshot), 700);
}
