import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TourView = 'boards' | 'you';

type Step = {
  target?: string;
  view: TourView;
  title: string;
  text: string;
};

const SLIDE_MS = 360;
const CARD_WIDTH = 340;
const GAP = 14;

function stepsFor(returning: boolean): Step[] {
  return [
    {
      view: 'boards',
      title: 'Welcome to rooost',
      text: 'Plan your work, time it, and watch your year fill in. Here’s a quick look using sample data.',
    },
    {
      target: '.column:first-child article.card',
      view: 'boards',
      title: 'Cards are your tasks',
      text: 'Drag one to the right as it moves along. The last column is the finish line.',
    },
    {
      target: '.column:first-child article.card .card-play',
      view: 'boards',
      title: 'Time any task',
      text: 'Press play on a card. The timer keeps running while you use the rest of the app.',
    },
    {
      target: '.view-slider',
      view: 'boards',
      title: 'Two sides, one app',
      text: 'Boards is where you plan. You is where you see your progress.',
    },
    {
      target: '.panel--heat',
      view: 'you',
      title: 'Every hour fills a square',
      text: 'Darker means more time. Click a day to see what you worked on.',
    },
    {
      target: '.panel--coming',
      view: 'you',
      title: 'Deadlines from every board',
      text: 'Soonest first. Pin the big ones to keep a countdown at the top.',
    },
    {
      view: 'boards',
      title: 'That was the sample',
      text: returning ? 'Your own boards are just as you left them.' : 'Your own board is empty and ready.',
    },
  ];
}

type TourProps = {
  returning: boolean;
  onView: (view: TourView) => void;
  onFinish: () => void;
};

export function Tour({ returning, onView, onFinish }: TourProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const shownView = useRef<TourView>('boards');
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);

  const steps = stepsFor(returning);
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);

  useEffect(() => {
    onView(step.view);
  }, [step.view, onView]);

  const measure = useCallback(() => {
    const element = step.target ? document.querySelector(step.target) : null;
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const box = element?.getBoundingClientRect() ?? null;
    setRect(box);

    const height = card.current?.offsetHeight ?? 180;
    const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
    if (!box) {
      setCardPosition({
        top: (window.innerHeight - height) / 2,
        left: (window.innerWidth - width) / 2,
      });
      return;
    }
    const fitsBelow = box.bottom + GAP + height < window.innerHeight - 12;
    const fitsAbove = box.top - GAP - height > 12;
    const top = fitsBelow
      ? box.bottom + GAP
      : fitsAbove
        ? box.top - GAP - height
        : window.innerHeight - height - 12;
    const centred = box.left + box.width / 2 - width / 2;
    setCardPosition({ top, left: Math.max(12, Math.min(window.innerWidth - width - 12, centred)) });
  }, [step.target]);

  useLayoutEffect(() => {
    // Mid-slide positions are wrong, so a step on the other side waits for it to land.
    const sliding = shownView.current !== step.view;
    shownView.current = step.view;
    if (!sliding) measure();
    const settle = setTimeout(measure, SLIDE_MS);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
    };
  }, [measure, index, step.view]);

  useEffect(() => {
    primary.current?.focus();
  }, [index]);

  return (
    <dialog
      ref={dialog}
      className="tour"
      aria-label="Introduction to rooost"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinish();
        }
      }}
      onClose={() => {
        if (!dialog.current?.open) onFinish();
      }}
    >
      <div
        className={rect ? 'tour-hole' : 'tour-hole is-empty'}
        style={
          rect
            ? {
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
              }
            : undefined
        }
      />
      <div
        ref={card}
        className="tour-card"
        style={cardPosition ?? { visibility: 'hidden' }}
        role="group"
        aria-live="polite"
      >
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-actions">
          {!isFirst && !isLast && (
            <span className="tour-progress">
              {index} of {steps.length - 2}
            </span>
          )}
          {isFirst && (
            <button type="button" className="btn btn--plain" onClick={onFinish}>
              Skip
            </button>
          )}
          <button
            ref={primary}
            type="button"
            className="btn btn--dark"
            onClick={() => (isLast ? onFinish() : setIndex((value) => value + 1))}
          >
            {isFirst ? 'Show me' : isLast ? (returning ? 'Back to my boards' : 'Start with an empty board') : 'Next'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
