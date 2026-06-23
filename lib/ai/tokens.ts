import { MODELS, type AiModel } from './models';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface CostEstimate {
  inputTokens: number;
  estOutputTokens: number;
  estCostUsd: number;
}

export function estimateCost(
  promptText: string,
  model: AiModel,
  estOutputTokens = 600
): CostEstimate {
  const inputTokens = estimateTokens(promptText);
  const m = MODELS[model];
  const estCostUsd =
    (inputTokens / 1_000_000) * m.inputPerMTok +
    (estOutputTokens / 1_000_000) * m.outputPerMTok;
  return { inputTokens, estOutputTokens, estCostUsd: Math.round(estCostUsd * 1e6) / 1e6 };
}

export function formatCostUsd(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
