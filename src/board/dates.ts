function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateKeyFromToday(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

// Built once: creating an Intl formatter is far slower than using one.
const dueThisYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dueOtherYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDue(key: string): string {
  const today = new Date();
  if (key === toDateKey(today)) return 'Today';
  if (key === dateKeyFromToday(1)) return 'Tomorrow';
  if (key === dateKeyFromToday(-1)) return 'Yesterday';
  const date = dateFromKey(key);
  return (date.getFullYear() === today.getFullYear() ? dueThisYear : dueOtherYear).format(date);
}

export function isOverdue(key: string): boolean {
  return key < dateKeyFromToday(0);
}

export function daysUntil(key: string): number {
  return Math.round((dateFromKey(key).getTime() - dateFromKey(dateKeyFromToday(0)).getTime()) / 86400000);
}

export function formatCountdown(key: string): string {
  const days = daysUntil(key);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} late`;
  return `${days} days`;
}

/** "2h 14m", "45m", or "under 1m". */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds > 0 ? 'under 1m' : '0m';
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "12:34" or "1:02:33". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = pad(seconds % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}
