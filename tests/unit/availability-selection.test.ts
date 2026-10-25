import { describe, expect, it } from 'vitest';
import { dateCells, dayCells, filterTimeCells, paintSelection, parseWallTime, rangesToSelection, selectionToRanges, spanEndDate } from '@/app/r/[share]/selection';

describe('availability selection', () => {
  it('paints a dragged span in either direction without toggling cells twice', () => {
    const cells = dateCells('2026-10-01', '2026-10-07');
    const selected = paintSelection(new Set(['2026-10-07']), cells, 4, 1, true);
    expect([...selected].sort()).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07']);
    expect(paintSelection(selected, cells, 4, 1, true)).toEqual(selected);
    expect([...paintSelection(selected, cells, 2, 3, false)].sort()).toEqual(['2026-10-02', '2026-10-05', '2026-10-07']);
  });
  it('merges only contiguous selected dates and restores disjoint ranges', () => {
    const cells = dateCells('2026-10-01', '2026-10-07');
    const selected = new Set(['2026-10-01', '2026-10-02', '2026-10-05']);
    const ranges = selectionToRanges(cells, selected);
    expect(ranges).toEqual([{ start: '2026-10-01', end: '2026-10-03' }, { start: '2026-10-05', end: '2026-10-06' }]);
    expect(rangesToSelection(cells, ranges)).toEqual(selected);
  });
  it('uses real 15-minute instants through short and long DST days', () => {
    expect(dayCells('2026-03-08', 'America/New_York')).toHaveLength(92);
    expect(dayCells('2026-11-01', 'America/New_York')).toHaveLength(100);
    const cells = dayCells('2026-11-01', 'America/New_York');
    expect(new Set(cells.map(cell => cell.start)).size).toBe(100);
    expect(selectionToRanges(cells, new Set(cells.map(cell => cell.start)))).toEqual([{ start: cells[0].start, end: cells.at(-1)!.end }]);
  });
  it('restores equivalent saved timestamps regardless of UTC formatting', () => {
    const cells = dayCells('2026-10-25', 'America/New_York');
    expect(rangesToSelection(cells, [{ start: '2026-10-25T12:00:00Z', end: '2026-10-25T12:30:00Z' }]).size).toBe(2);
  });
  it('computes whole calendar spans rather than a fixed number of hours', () => {
    expect(spanEndDate('2026-10-25', 'fortnight')).toBe('2026-11-07');
    expect(spanEndDate('2026-01-31', 'month')).toBe('2026-02-28');
    expect(spanEndDate('2027-03-01', 'year')).toBe('2028-02-29');
    expect(spanEndDate('2026-10-25', 'months', 3)).toBe('2027-01-31');
  });
  it('keeps every date selectable when twelve months extend to the last month end', () => {
    expect(spanEndDate('2026-10-24', 'months', 12)).toBe('2027-10-31');
    const cells = dateCells('2026-10-24', '2027-10-31');
    expect(cells).toHaveLength(373);
    expect(cells.at(-1)).toEqual({ start: '2027-10-31', end: '2027-11-01' });
  });
  it('pages every hour into a local six-hour section without losing repeated DST hours', () => {
    const cells = dayCells('2026-11-01', 'America/New_York');
    const sections = ['overnight', 'morning', 'afternoon', 'evening'] as const;
    const pages = sections.map(section => filterTimeCells(cells, 'America/New_York', section));
    expect(pages.map(page => page.length)).toEqual([28, 24, 24, 24]);
    expect(pages.flat()).toEqual(cells);
    expect(filterTimeCells(cells, 'America/New_York', 'all')).toEqual(cells);
    expect(filterTimeCells(cells, 'America/New_York', 'afternoon')[0].start).toBe('2026-11-01T17:00:00.000Z');
  });
  it('rejects skipped and ambiguous manual wall times instead of silently choosing another instant', () => {
    expect(parseWallTime('2027-03-14', '02:30', 'America/New_York')).toBeNull();
    expect(parseWallTime('2027-11-07', '01:30', 'America/New_York')).toBeNull();
    expect(parseWallTime('2027-03-14', '03:45', 'America/New_York')?.toUTC().toISO()).toBe('2027-03-14T07:45:00.000Z');
    expect(parseWallTime('2027-02-30', '12:00', 'America/New_York')).toBeNull();
  });
  it('supports an explicit end-of-day midnight while rejecting a midnight skipped by a timezone change', () => {
    expect(parseWallTime('2027-03-14', '24:00', 'America/New_York')?.toUTC().toISO()).toBe('2027-03-15T04:00:00.000Z');
    expect(parseWallTime('2018-11-03', '24:00', 'America/Sao_Paulo')).toBeNull();
  });
});
