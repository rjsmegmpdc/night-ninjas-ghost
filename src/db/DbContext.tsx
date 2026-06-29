import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getWorker } from './client';

interface DbCtx {
  ready: boolean;
  error: string | null;
}

const Ctx = createContext<DbCtx>({ ready: false, error: null });

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = getWorker();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ready') setReady(true);
      if (e.data?.type === 'error') setError(e.data.error as string);
    };
    w.addEventListener('message', handler);
    return () => w.removeEventListener('message', handler);
  }, []);

  return <Ctx.Provider value={{ ready, error }}>{children}</Ctx.Provider>;
}

export function useDb() {
  return useContext(Ctx);
}
