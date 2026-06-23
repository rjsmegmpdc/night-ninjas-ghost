import type { AiModel } from '@/lib/store/settings';

export type { AiModel };

export interface ModelInfo {
  id: string;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODELS: Record<AiModel, ModelInfo> = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    inputPerMTok: 0.8,
    outputPerMTok: 4.0,
  },
  sonnet: {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
  },
};
