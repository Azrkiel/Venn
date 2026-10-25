'use client';

import { useEffect } from 'react';

// Controls that compress on press and rebound on release. Calendar cells are excluded:
// they are dragged across, so they change colour only and keep their geometry.
const PRESSABLE = 'button, a[href], summary, [role="button"], label:has(> input[type="radio"]), label:has(> input[type="checkbox"])';
const EXCLUDED = '[data-cell-index], [data-week-date], [data-no-press]';
const PRESS = { duration: 120, easing: 'cubic-bezier(.3, .7, .4, 1)', fill: 'forwards' } as const;
const REBOUND = { duration: 220, easing: 'cubic-bezier(.2, .8, .3, 1.2)' } as const;

function pressable(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest<HTMLElement>(PRESSABLE) : null;
  if (!element || element.closest(EXCLUDED) || element.matches(':disabled, [aria-disabled="true"]')) return null;
  return element;
}

export function InteractionFeedback() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const held = new Map<HTMLElement, Animation>();
    // `scale` composes with any existing transform, so controls keep their own layout transforms.
    const rebound = (element: HTMLElement, from: number) => {
      element.animate([{ scale: String(from) }, { scale: '1.025' }, { scale: '1' }], REBOUND);
    };
    const release = () => {
      for (const [element, animation] of held) { animation.cancel(); rebound(element, 0.96); }
      held.clear();
    };
    const down = (event: PointerEvent) => {
      if (event.button > 0 || reduced.matches) return;
      const element = pressable(event.target);
      if (!element || held.has(element)) return;
      held.set(element, element.animate([{ scale: '1' }, { scale: '0.96' }], PRESS));
    };
    // Enter/Space activation has no pointer; give it the same acknowledgement.
    const click = (event: MouseEvent) => {
      if (event.detail !== 0 || reduced.matches) return;
      const element = pressable(event.target);
      if (element) rebound(element, 0.96);
    };
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('click', click, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      document.removeEventListener('click', click);
      for (const animation of held.values()) animation.cancel();
    };
  }, []);
  return null;
}
