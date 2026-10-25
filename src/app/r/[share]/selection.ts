import { DateTime } from 'luxon';

export type SelectionRange = { start: string; end: string };
export type PlanningScale = 'day' | 'week' | 'fortnight' | 'month' | 'months' | 'year';
export type TimeSection = 'overnight' | 'morning' | 'afternoon' | 'evening' | 'all';

/** Manual wall times must identify one real instant; the grid exposes repeated hours with explicit offsets. */
export function parseWallTime(date: string, time: string, zone: string): DateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== '24:00') return null;
  const calendarDay = DateTime.fromISO(date, { zone: 'UTC' });
  if (!calendarDay.isValid || calendarDay.toISODate() !== date) return null;
  const wallDate = time === '24:00' ? calendarDay.plus({ days: 1 }).toISODate()! : date;
  const wallTime = time === '24:00' ? '00:00' : time;
  const instant = DateTime.fromISO(`${wallDate}T${wallTime}`, { zone });
  if (!instant.isValid || instant.toFormat('yyyy-MM-dd HH:mm') !== `${wallDate} ${wallTime}`
    || instant.getPossibleOffsets().length !== 1) return null;
  return instant;
}

export function filterTimeCells(cells: SelectionRange[], zone: string, section: TimeSection): SelectionRange[] {
  if (section === 'all') return cells;
  const startHour = { overnight: 0, morning: 6, afternoon: 12, evening: 18 }[section];
  return cells.filter(cell => {
    const hour = DateTime.fromISO(cell.start, { zone }).hour;
    return hour >= startHour && hour < startHour + 6;
  });
}

export function spanEndDate(start: string, scale: PlanningScale, monthCount = 2): string {
  const day = DateTime.fromISO(start, { zone: 'UTC' });
  const end = scale === 'day' ? day : scale === 'week' ? day.plus({ days: 6 })
    : scale === 'fortnight' ? day.plus({ days: 13 })
      : day.plus({ months: scale === 'year' ? 12 : scale === 'months' ? monthCount : 1 }).minus({ days: 1 });
  return (scale === 'month' || scale === 'months' ? end.endOf('month') : end).toISODate() ?? start;
}

export function dateCells(start: string, endInclusive: string): SelectionRange[] {
  const cells: SelectionRange[] = [];
  let date = DateTime.fromISO(start, { zone: 'UTC' });
  const limit = DateTime.fromISO(endInclusive, { zone: 'UTC' });
  while (date.isValid && date <= limit && cells.length < 400) {
    const next = date.plus({ days: 1 });
    cells.push({ start: date.toISODate()!, end: next.toISODate()! });
    date = next;
  }
  return cells;
}

export function dayCells(date: string, zone: string): SelectionRange[] {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  const end = start.plus({ days: 1 });
  const cells: SelectionRange[] = [];
  for (let time = start.toMillis(); time < end.toMillis(); time += 900_000) {
    cells.push({ start: new Date(time).toISOString(), end: new Date(Math.min(time + 900_000, end.toMillis())).toISOString() });
  }
  return cells;
}

const position = (value: string) => value.length === 10 ? DateTime.fromISO(value, { zone: 'UTC' }).toMillis() : Date.parse(value);

export function rangesToSelection(cells: SelectionRange[], ranges: SelectionRange[]): Set<string> {
  return new Set(cells.filter(cell => ranges.some(range => position(range.start) <= position(cell.start)
    && position(range.end) >= position(cell.end))).map(cell => cell.start));
}

export function selectionToRanges(cells: SelectionRange[], selected: Set<string>): SelectionRange[] {
  const ranges: SelectionRange[] = [];
  for (const cell of cells) {
    if (!selected.has(cell.start)) continue;
    const previous = ranges.at(-1);
    if (previous && position(previous.end) === position(cell.start)) previous.end = cell.end;
    else ranges.push({ ...cell });
  }
  return ranges;
}

export function paintSelection(selected: Set<string>, cells: SelectionRange[], from: number, to: number, enabled: boolean): Set<string> {
  const next = new Set(selected);
  const low = Math.max(0, Math.min(from, to));
  const high = Math.min(cells.length - 1, Math.max(from, to));
  for (let index = low; index <= high; index++) {
    if (enabled) next.add(cells[index].start); else next.delete(cells[index].start);
  }
  return next;
}
