'use client';

import { useState, useTransition } from 'react';
import { Brain, CheckCircle2, AlertTriangle, Trash2, Zap } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import {
  saveAnthropicKey,
  deleteAnthropicKey,
  saveAiModel,
  testAnthropicConnection,
} from '@/lib/actions/ai';
import type { AiModel } from '@/lib/store/settings';
import { MODELS } from '@/lib/ai/models';

const inputClass =
  'w-full bg-ink-shadow border border-ink-line px-3 py-2 font-mono text-sm text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none';

interface Props {
  hasKey: boolean;
  model: AiModel;
}

export function AiSection({ hasKey, model: initialModel }: Props) {
  const [keyInput, setKeyInput] = useState('');
  const [currentModel, setCurrentModel] = useState<AiModel>(initialModel);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; model?: string } | null>(null);
  const [deleteResult, setDeleteResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [hasKeyNow, setHasKeyNow] = useState(hasKey);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const fd = new FormData();
    fd.set('apiKey', keyInput);
    setSaveResult(null);
    startTransition(async () => {
      const r = await saveAnthropicKey(fd);
      setSaveResult(r);
      if (r.ok) {
        setHasKeyNow(true);
        setKeyInput('');
      }
    });
  };

  const handleDelete = () => {
    setDeleteResult(null);
    startTransition(async () => {
      const r = await deleteAnthropicKey();
      setDeleteResult(r);
      if (r.ok) setHasKeyNow(false);
    });
  };

  const handleTest = () => {
    setTestResult(null);
    startTransition(async () => {
      const r = await testAnthropicConnection();
      setTestResult(r);
    });
  };

  const handleModelChange = (m: AiModel) => {
    const fd = new FormData();
    fd.set('model', m);
    setCurrentModel(m);
    startTransition(async () => {
      await saveAiModel(fd);
    });
  };

  return (
    <Card className="space-y-5">
      <CardLabel className="flex items-center gap-1.5">
        <Brain size={12} strokeWidth={1.5} className="text-bone-mute" />
        ai coach · byok anthropic
      </CardLabel>

      {/* Privacy note */}
      <p className="font-mono text-xs text-bone-dim leading-relaxed">
        Your key is stored in the OS keychain — never in the database or any file. Each AI request
        is scoped to a single question; you can inspect exactly what was sent before each call.
      </p>

      {/* Status */}
      <div className="flex items-center gap-2">
        {hasKeyNow ? (
          <>
            <CheckCircle2 size={14} strokeWidth={1.5} className="text-signal-ok shrink-0" />
            <span className="font-mono text-xs text-signal-ok">API key saved</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} strokeWidth={1.5} className="text-signal-warn shrink-0" />
            <span className="font-mono text-xs text-signal-warn">No key saved — AI features disabled</span>
          </>
        )}
      </div>

      {/* Key input */}
      <div className="space-y-2">
        <label className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
          {hasKeyNow ? 'Replace key' : 'Add Anthropic API key'}
        </label>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="sk-ant-api03-…"
          className={inputClass}
          autoComplete="off"
        />
        <button
          onClick={handleSave}
          disabled={pending || !keyInput.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-ink font-display tracking-wide-display uppercase text-xs hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save key'}
        </button>
        {saveResult && (
          <p className={`font-mono text-xs ${saveResult.ok ? 'text-signal-ok' : 'text-signal-miss'}`}>
            {saveResult.ok ? 'Key saved.' : saveResult.error}
          </p>
        )}
      </div>

      {/* Model selector */}
      <div className="space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-bone-mute block">
          Model
        </span>
        <div className="flex gap-2">
          {(['haiku', 'sonnet'] as AiModel[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModelChange(m)}
              disabled={pending}
              className={
                'px-3 py-1.5 font-mono text-xs border transition-colors ' +
                (currentModel === m
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-ink-line text-bone-mute hover:border-bone-dim hover:text-bone')
              }
            >
              {MODELS[m].label}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-bone-mute">
          Haiku: fastest + cheapest (~$0.001/briefing). Sonnet: better reasoning, ~4× cost.
        </p>
      </div>

      {/* Test + delete row */}
      {hasKeyNow && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleTest}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink-line font-mono text-xs text-bone-dim hover:text-bone hover:border-bone-dim disabled:opacity-50 transition-colors"
          >
            <Zap size={12} strokeWidth={1.5} />
            {pending ? 'Testing…' : 'Test connection'}
          </button>

          <button
            onClick={handleDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-signal-miss/40 font-mono text-xs text-signal-miss/70 hover:text-signal-miss hover:border-signal-miss disabled:opacity-50 transition-colors"
          >
            <Trash2 size={12} strokeWidth={1.5} />
            Remove key
          </button>

          {testResult && (
            <span
              className={`font-mono text-xs ${testResult.ok ? 'text-signal-ok' : 'text-signal-miss'}`}
            >
              {testResult.ok ? `Connected · ${testResult.model}` : testResult.error}
            </span>
          )}
          {deleteResult && !deleteResult.ok && (
            <span className="font-mono text-xs text-signal-miss">{deleteResult.error}</span>
          )}
        </div>
      )}
    </Card>
  );
}
