import { useEffect, type RefObject } from 'react';

export function useClickAway(active: boolean, root: RefObject<HTMLElement | null>, onAway: () => void) {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onAway();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [active, root, onAway]);
}
