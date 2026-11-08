import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { CheckIcon, ChevronRightIcon } from './Icons';

export type ContextItem =
  | {
      type: 'item';
      label: string;
      onSelect: () => void;
      danger?: boolean;
      keepOpen?: boolean;
      checked?: boolean;
      dot?: string;
    }
  | { type: 'sub'; label: string; items: ContextItem[] }
  | { type: 'divider' }
  | { type: 'custom'; id: string; node: ReactNode };

const EDGE = 8;

function MenuList({
  items,
  onClose,
  isSub = false,
  focusFirst = false,
  onBack,
}: {
  items: ContextItem[];
  onClose: () => void;
  isSub?: boolean;
  focusFirst?: boolean;
  onBack?: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [focusSub, setFocusSub] = useState(false);
  const [placement, setPlacement] = useState({ flip: false, shift: 0 });

  useLayoutEffect(() => {
    if (!isSub || !list.current) return;
    const box = list.current.getBoundingClientRect();
    setPlacement({
      flip: box.right > window.innerWidth - EDGE,
      shift: Math.min(0, window.innerHeight - EDGE - box.bottom),
    });
  }, [isSub]);

  const rows = () =>
    Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>(':scope > .ctx-row > [role^="menuitem"]') ?? [],
    );

  useEffect(() => {
    if (focusFirst) rows()[0]?.focus();
  }, [focusFirst]);

  const onKeyDown = (event: KeyboardEvent) => {
    const all = rows();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1 && !['ArrowDown', 'ArrowUp'].includes(event.key)) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const start = index === -1 ? (step === 1 ? -1 : 0) : index;
      all[(start + step + all.length) % all.length]?.focus();
    } else if (event.key === 'ArrowRight') {
      const trigger = all[index];
      if (trigger?.getAttribute('aria-haspopup')) {
        event.preventDefault();
        event.stopPropagation();
        setFocusSub(true);
        setOpenSub(Number(trigger.dataset.index));
      }
    } else if (event.key === 'ArrowLeft' && onBack) {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  return (
    <div
      ref={list}
      className={[
        'ctx-list',
        isSub ? 'ctx-list--sub' : '',
        placement.flip ? 'is-flipped' : '',
      ].join(' ')}
      style={isSub ? { marginTop: placement.shift } : undefined}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        if (item.type === 'divider') return <div key={index} className="ctx-divider" role="separator" />;
        if (item.type === 'custom') return <div key={item.id}>{item.node}</div>;

        if (item.type === 'sub') {
          const open = openSub === index;
          return (
            <div
              key={item.label}
              className="ctx-row"
              onMouseEnter={() => {
                setFocusSub(false);
                setOpenSub(index);
              }}
            >
              <button
                type="button"
                className={open ? 'ctx-item is-open' : 'ctx-item'}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                data-index={index}
                onClick={() => setOpenSub(index)}
              >
                <span className="ctx-label">{item.label}</span>
                <ChevronRightIcon size={13} />
              </button>
              {open && (
                <MenuList
                  items={item.items}
                  onClose={onClose}
                  isSub
                  focusFirst={focusSub}
                  onBack={() => {
                    const trigger = rows()[rows().findIndex((row) => Number(row.dataset.index) === index)];
                    setOpenSub(null);
                    trigger?.focus();
                  }}
                />
              )}
            </div>
          );
        }

        return (
          <div key={item.label} className="ctx-row" onMouseEnter={() => setOpenSub(null)}>
            <button
              type="button"
              className={item.danger ? 'ctx-item ctx-item--danger' : 'ctx-item'}
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              data-index={index}
              onClick={() => {
                item.onSelect();
                if (!item.keepOpen) onClose();
              }}
            >
              {item.dot && <i className="ctx-dot" style={{ background: item.dot }} aria-hidden="true" />}
              <span className="ctx-label">{item.label}</span>
              {item.checked && <CheckIcon size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextItem[];
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - box.width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - box.height - EDGE)),
    });
  }, [x, y]);

  useEffect(() => {
    if (!root.current?.contains(document.activeElement)) previousFocus.current = document.activeElement;
    root.current?.querySelector<HTMLElement>('.ctx-list')?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(root.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) onClose();
    };
    const onScroll = (event: Event) => {
      if (!inside(event.target)) onClose();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={root}
      className="ctx"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}
