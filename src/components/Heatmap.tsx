import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatDuration, toDateKey } from '../board/dates';
import { heatLevel, mondayOf } from '../board/stats';

const WEEKS = 53;

type Cell = { key: string; date: Date; seconds: number };

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short' });

type HeatmapProps = {
  totals: Map<string, number>;
  selected: string;
  onSelect: (key: string) => void;
  /** Passed in so the grid moves on to a new day at midnight. */
  todayKey: string;
};

export const Heatmap = memo(function Heatmap({ totals, selected, onSelect, todayKey }: HeatmapProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);


  const { cells, months } = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = mondayOf(end);
    start.setDate(start.getDate() - (WEEKS - 1) * 7);

    const list: Cell[] = [];
    const labels: { column: number; label: string }[] = [];
    let lastMonth = -1;
    for (let index = 0; ; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      if (date > end) break;
      if (index % 7 === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        labels.push({ column: index / 7, label: monthLabel.format(date) });
      }
      const key = toDateKey(date);
      list.push({ key, date, seconds: totals.get(key) ?? 0 });
    }
    return { cells: list, months: labels.filter((_, i) => i > 0 || (labels[1]?.column ?? 9) > 2) };
  }, [totals, todayKey]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  const selectedIndex = cells.findIndex((cell) => cell.key === selected);
  const tabStop = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : cells.length - 1);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const offsets: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(cells.length - 1, index + offset));
    setFocusIndex(next);
    grid.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  return (
    <div className="heat-scroll" ref={scroller}>
      <div className="heat">
        <div className="heat-months" aria-hidden="true">
          {months.map((month) => (
            <span key={month.column} style={{ gridColumnStart: month.column + 1 }}>
              {month.label}
            </span>
          ))}
        </div>
        <div className="heat-grid" ref={grid} role="group" aria-label="Time tracked per day">
          {cells.map((cell, index) => {
            const label = `${dayLabel.format(cell.date)}: ${
              cell.seconds > 0 ? formatDuration(cell.seconds) : 'nothing tracked'
            }`;
            return (
              <button
                key={cell.key}
                type="button"
                className={[
                  'hm',
                  `hm--${heatLevel(cell.seconds)}`,
                  cell.key === selected ? 'is-selected' : '',
                ].join(' ')}
                tabIndex={index === tabStop ? 0 : -1}
                title={label}
                aria-label={label}
                aria-pressed={cell.key === selected}
                onClick={() => {
                  setFocusIndex(index);
                  onSelect(cell.key);
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
