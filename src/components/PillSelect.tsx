import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronRightIcon } from './Icons';
import { useClickAway } from './useClickAway';

export type PillOption = { value: string; label: string };

type PillSelectProps = {
  label: string;
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
};

const EDGE = 8;

/** A browser's own dropdown list can't be styled, so this one is drawn by the app. */
export function PillSelect({ label, value, options, onChange }: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setShift(0);
  };

  useClickAway(open, root, close);

  useLayoutEffect(() => {
    const node = list.current;
    if (!open || !node) return;
    const right = node.closest('.sheet-body')?.getBoundingClientRect().right ?? window.innerWidth;
    setShift(Math.min(0, right - EDGE - node.getBoundingClientRect().right));
    node.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [open]);

  const choose = (next: string) => {
    close();
    trigger.current?.focus();
    if (next !== value) onChange(next);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => items[(index + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Escape') {
      // Only the list closes, not the card behind it.
      event.stopPropagation();
      close();
      trigger.current?.focus();
    } else return;
    event.preventDefault();
  };

  const onBlur = (event: FocusEvent) => {
    if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) close();
  };

  return (
    <div className="pill-select-wrap" ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        type="button"
        className="pill-select"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="pill-select-text">{options.find((option) => option.value === value)?.label}</span>
        <ChevronRightIcon size={12} />
      </button>
      {open && (
        <div
          ref={list}
          className="menu-list pill-select-list"
          style={{ left: shift }}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="menu-item pill-option"
              onClick={() => choose(option.value)}
            >
              <span className="pill-select-text">{option.label}</span>
              {option.value === value && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
