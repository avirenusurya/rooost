import { toDateKey } from './dates';
import type { Session, Timer } from './types';

export const RUNNING_SESSION_ID = 'running';

/** Includes the running timer, so totals move while you work. */
export function withRunningTimer(sessions: Session[], timer: Timer | null, now: number): Session[] {
  if (!timer) return sessions;
  return [
    ...sessions,
    {
      id: RUNNING_SESSION_ID,
      boardId: timer.boardId,
      cardId: timer.cardId,
      boardTitle: timer.boardTitle,
      cardTitle: timer.cardTitle,
      startedAt: timer.startedAt,
      endedAt: Math.max(now, timer.startedAt),
      seconds: Math.max(0, Math.round((now - timer.startedAt) / 1000)),
    },
  ];
}

function eachDay(session: Session, visit: (dateKey: string, seconds: number) => void) {
  let cursor = session.startedAt;
  while (cursor < session.endedAt) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const end = Math.min(midnight, session.endedAt);
    visit(toDateKey(date), Math.round((end - cursor) / 1000));
    cursor = end;
  }
}

export function secondsByDay(sessions: Session[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    eachDay(session, (key, seconds) => totals.set(key, (totals.get(key) ?? 0) + seconds));
  }
  return totals;
}

/** Adds a few sessions to existing day totals without recounting the rest. */
export function addSessionsByDay(base: Map<string, number>, extra: Session[]): Map<string, number> {
  if (extra.length === 0) return base;
  const totals = new Map(base);
  for (const session of extra) {
    eachDay(session, (key, seconds) => totals.set(key, (totals.get(key) ?? 0) + seconds));
  }
  return totals;
}

export function secondsByCard(sessions: Session[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    totals.set(session.cardId, (totals.get(session.cardId) ?? 0) + session.seconds);
  }
  return totals;
}

/** A card with two tags counts fully towards both. */
export function secondsByLabel(
  sessions: Session[],
  labelsOf: (session: Session) => string[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const id of labelsOf(session)) {
      totals.set(id, (totals.get(id) ?? 0) + session.seconds);
    }
  }
  return totals;
}

export type DayEntry = { session: Session; seconds: number };

export function sessionsOnDay(sessions: Session[], dayKey: string): DayEntry[] {
  const entries: DayEntry[] = [];
  const [year, month, day] = dayKey.split('-').map(Number);
  const dayStart = new Date(year, month - 1, day).getTime();
  const dayEnd = new Date(year, month - 1, day + 1).getTime();
  for (const session of sessions) {
    // Most sessions are on other days; skip them before walking their hours.
    if (session.endedAt <= dayStart || session.startedAt >= dayEnd) continue;
    let seconds = 0;
    eachDay(session, (key, part) => {
      if (key === dayKey) seconds += part;
    });
    if (seconds > 0) entries.push({ session, seconds });
  }
  return entries.sort((a, b) => b.session.startedAt - a.session.startedAt);
}

/** A day you haven't reached yet doesn't break the streak, so today may be empty. */
export function currentStreak(totals: Map<string, number>, today = new Date()): number {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!totals.get(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (totals.get(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export function sumBetween(totals: Map<string, number>, start: Date, end: Date): number {
  let sum = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    sum += totals.get(toDateKey(cursor)) ?? 0;
  }
  return sum;
}

export function heatLevel(seconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  const hours = seconds / 3600;
  if (hours < 1) return 1;
  if (hours < 2) return 2;
  if (hours < 4) return 3;
  return 4;
}
