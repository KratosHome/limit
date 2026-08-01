import type { DateRange, PeriodKey } from '../types';

export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function offsetDay(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function rangeForPeriod(period: PeriodKey, custom?: DateRange): DateRange {
  const now = new Date();
  const today = toDayKey(now);
  if (period === 'yesterday') {
    const yesterday = toDayKey(offsetDay(now, -1));
    return { from: yesterday, to: yesterday };
  }
  if (period === '7days') return { from: toDayKey(offsetDay(now, -6)), to: today };
  if (period === '30days') return { from: toDayKey(offsetDay(now, -29)), to: today };
  if (period === 'custom' && custom) return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  return { from: today, to: today };
}

export function formatDuration(seconds: number, compact = false): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours && minutes) return compact ? `${hours} год ${minutes} хв` : `${hours} год ${minutes} хв`;
  if (hours) return `${hours} год`;
  if (minutes) return `${minutes} хв`;
  return safeSeconds > 0 ? '< 1 хв' : '0 хв';
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function formatChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatShortDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
}

export function formatFullDate(date = new Date()): string {
  const value = new Intl.DateTimeFormat('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function appInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

const appPalettes = [
  ['#5667e8', '#eef0ff'],
  ['#0ea5a8', '#e8fbfa'],
  ['#8b5cf6', '#f3efff'],
  ['#e96f4d', '#fff0eb'],
  ['#d19a18', '#fff8dc'],
  ['#2986cc', '#eaf6ff'],
  ['#c65385', '#fff0f6'],
];

export function appPalette(id: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return appPalettes[Math.abs(hash) % appPalettes.length] as [string, string];
}
