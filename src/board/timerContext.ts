import { createContext, useContext, useLayoutEffect, useState } from 'react';

export type TimerApi = {
  tracked: Map<string, number>;
  runningCardId: string | null;
  startedAt: number | null;
  start: (cardId: string) => void;
  stop: () => void;
  discard: () => void;
};

export const TimerContext = createContext<TimerApi>({
  tracked: new Map(),
  runningCardId: null,
  startedAt: null,
  start: () => undefined,
  stop: () => undefined,
  discard: () => undefined,
});

export const useTimerApi = () => useContext(TimerContext);

export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  // Layout effect, so a clock that resumes shows the fresh time on its first paint.
  useLayoutEffect(() => {
    if (intervalMs === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
