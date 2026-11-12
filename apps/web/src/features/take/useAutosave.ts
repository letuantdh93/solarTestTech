import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';

export interface AnswerPatch {
  selectedOptionIds?: string[];
  numericValue?: number | null;
  flagged?: boolean;
}
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

/**
 * Per-question autosave queue: merges rapid changes, saves sequentially,
 * retries with backoff on network errors, and reports terminal states
 * (time up / already submitted) to the caller.
 */
export function useAutosave(attemptId: string, onTerminal: (code: string) => void) {
  const pending = useRef(new Map<string, AnswerPatch>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const retryDelay = useRef(1000);
  const terminal = useRef(false);

  const flushOne = useCallback(
    async (qid: string) => {
      const patch = pending.current.get(qid);
      if (!patch || terminal.current) return;
      pending.current.delete(qid);
      setState('saving');
      try {
        await api(`/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptQuestionId: qid, ...patch } });
        retryDelay.current = 1000;
        setLastSaved(new Date());
        setState(pending.current.size ? 'saving' : 'saved');
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'TIME_UP' || e.code === 'SUBMITTED')) {
          terminal.current = true;
          onTerminal(e.code);
          return;
        }
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          setState('error'); // validation error: drop this patch
          return;
        }
        // Network/server error: requeue (newer local patches win) and retry with backoff.
        pending.current.set(qid, { ...patch, ...(pending.current.get(qid) ?? {}) });
        setState(navigator.onLine ? 'error' : 'offline');
        const d = retryDelay.current;
        retryDelay.current = Math.min(d * 2, 15000);
        schedule(qid, d);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId, onTerminal],
  );

  const run = useCallback(
    (qid: string) => {
      const chain = (inflight.current ?? Promise.resolve()).then(() => flushOne(qid));
      inflight.current = chain.finally(() => {
        if (inflight.current === chain) inflight.current = null;
      });
      return chain;
    },
    [flushOne],
  );

  const schedule = useCallback(
    (qid: string, delay: number) => {
      const t = timers.current.get(qid);
      if (t) clearTimeout(t);
      timers.current.set(qid, setTimeout(() => { timers.current.delete(qid); void run(qid); }, delay));
    },
    [run],
  );

  const save = useCallback(
    (qid: string, patch: AnswerPatch, debounceMs = 0) => {
      pending.current.set(qid, { ...(pending.current.get(qid) ?? {}), ...patch });
      setState('saving');
      schedule(qid, debounceMs);
    },
    [schedule],
  );

  /** Flush everything now (used before submit / when time runs out). */
  const flushAll = useCallback(async () => {
    for (const [qid, t] of timers.current) {
      clearTimeout(t);
      timers.current.delete(qid);
    }
    for (const qid of [...pending.current.keys()]) await run(qid);
    await inflight.current;
  }, [run]);

  useEffect(() => {
    const online = () => {
      for (const qid of pending.current.keys()) schedule(qid, 0);
    };
    const offline = () => setState('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [schedule]);

  return { save, flushAll, state, lastSaved, hasPending: () => pending.current.size > 0 };
}
