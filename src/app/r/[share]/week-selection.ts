import { DateTime } from 'luxon';

export type WeekRange = { start: string; end: string };
export type WeekCoordinate = { date: string; row: number };
export type WeekRow = { minute: number; fold: number };
export type WeekCell = WeekRange & WeekCoordinate & { offset: string; label: string };
export type WeekGrid = { dates: string[]; rows: WeekRow[]; byDate: Map<string, (WeekCell | null)[]> };

export function overlapsBusy(cell: WeekRange, busy: WeekRange[]): boolean {
  const start = Date.parse(cell.start), end = Date.parse(cell.end);
  if (!(start < end)) return false;
  return busy.some(interval => {
    const busyStart = Date.parse(interval.start), busyEnd = Date.parse(interval.end);
    return busyStart < busyEnd && busyStart < end && busyEnd > start;
  });
}

/** Align by local wall clock; an extra hour gets separate rows rather than collapsing two instants. */
export function buildWeekGrid(cells: WeekRange[], timezone: string): WeekGrid {
  const parsed = cells.map(cell => {
    const instant = DateTime.fromISO(cell.start, { zone: timezone });
    const possible = instant.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
    return { ...cell, date: instant.toISODate()!, minute: instant.hour * 60 + instant.minute,
      fold: Math.max(0, possible.findIndex(value => value.toMillis() === instant.toMillis())),
      offset: instant.toFormat('ZZ'), label: `Select ${instant.toFormat('yyyy-MM-dd h:mm a ZZ')}` };
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const folds = new Map<number, number>();
  for (const cell of parsed) folds.set(Math.floor(cell.minute / 60), Math.max(folds.get(Math.floor(cell.minute / 60)) ?? 0, cell.fold));
  const rows: WeekRow[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let fold = 0; fold <= (folds.get(hour) ?? 0); fold++) {
      for (let quarter = 0; quarter < 4; quarter++) rows.push({ minute: hour * 60 + quarter * 15, fold });
    }
  }
  const dates: string[] = [];
  if (parsed.length) {
    let date = DateTime.fromISO(parsed[0].date, { zone: 'UTC' });
    const end = DateTime.fromISO(parsed.at(-1)!.date, { zone: 'UTC' });
    while (date <= end) { dates.push(date.toISODate()!); date = date.plus({ days: 1 }); }
  }
  const byDate = new Map(dates.map(date => [date, Array<WeekCell | null>(rows.length).fill(null)]));
  const rowIndex = new Map(rows.map((row, index) => [`${row.minute}:${row.fold}`, index]));
  for (const cell of parsed) {
    const row = rowIndex.get(`${cell.minute}:${cell.fold}`)!;
    byDate.get(cell.date)![row] = { start: cell.start, end: cell.end, date: cell.date, row, offset: cell.offset, label: cell.label };
  }
  return { dates, rows, byDate };
}

export function weekPageDates(dates: string[], page: number): string[] {
  if (!dates.length) return [];
  const first = DateTime.fromISO(dates[0], { zone: 'UTC' }).plus({ days: page * 7 });
  return Array.from({ length: 7 }, (_, index) => first.plus({ days: index }).toISODate()!);
}

/** A cross-day drag paints a clock-time rectangle, never the intervening nights. */
export function paintWeekRectangle(selected: Set<string>, grid: WeekGrid, from: WeekCoordinate, to: WeekCoordinate, enabled: boolean): Set<string> {
  const next = new Set(selected);
  const fromDate = grid.dates.indexOf(from.date), toDate = grid.dates.indexOf(to.date);
  if (fromDate < 0 || toDate < 0) return next;
  for (let column = Math.min(fromDate, toDate); column <= Math.max(fromDate, toDate); column++) {
    const cells = grid.byDate.get(grid.dates[column])!;
    for (let row = Math.max(0, Math.min(from.row, to.row)); row <= Math.min(grid.rows.length - 1, Math.max(from.row, to.row)); row++) {
      const cell = cells[row];
      if (!cell) continue;
      if (enabled) next.add(cell.start); else next.delete(cell.start);
    }
  }
  return next;
}
