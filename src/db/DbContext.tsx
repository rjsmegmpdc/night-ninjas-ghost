import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getWorker } from './client';

interface DbCtx {
  ready: boolean;
  error: string | null;
  storage: string | null;
}

const Ctx = createContext<DbCtx>({ ready: false, error: null, storage: null });

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<string | null>(null);

  useEffect(() => {
    const w = getWorker();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ready') { setReady(true); setStorage((e.data.storage as string) ?? null); }
      if (e.data?.type === 'error') setError(e.data.error as string);
      // 'warn' is informational — does not block ready
    };
    w.addEventListener('message', handler);
    return () => w.removeEventListener('message', handler);
  }, []);

  return <Ctx.Provider value={{ ready, error, storage }}>{children}</Ctx.Provider>;
}

export function useDb() {
  return useContext(Ctx);
}
