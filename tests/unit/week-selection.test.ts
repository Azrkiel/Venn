import { describe, expect, it } from 'vitest';
import { dayCells, selectionToRanges } from '@/app/r/[share]/selection';
import { buildWeekGrid, overlapsBusy, paintWeekRectangle, weekPageDates } from '@/app/r/[share]/week-selection';

describe('weekly calendar alignment and painting', () => {
  it('paints the same clock range across dates without filling overnight', () => {
    const cells = [...dayCells('2027-01-15', 'America/New_York'), ...dayCells('2027-01-16', 'America/New_York')];
    const grid = buildWeekGrid(cells, 'America/New_York');
    expect(grid.rows).toHaveLength(96);
    const selected = paintWeekRectangle(new Set(), grid, { date: '2027-01-15', row: 48 }, { date: '2027-01-16', row: 51 }, true);
    expect(selectionToRanges(cells, selected)).toEqual([
      { start: '2027-01-15T17:00:00.000Z', end: '2027-01-15T18:00:00.000Z' },
      { start: '2027-01-16T17:00:00.000Z', end: '2027-01-16T18:00:00.000Z' },
    ]);
  });
  it('removes a reversed rectangle while preserving disjoint and off-page choices', () => {
    const cells = [...dayCells('2027-01-15', 'UTC'), ...dayCells('2027-01-16', 'UTC')];
    const grid = buildWeekGrid(cells, 'UTC');
    const first = paintWeekRectangle(new Set(['2030-01-01T12:00:00Z']), grid, { date: '2027-01-15', row: 48 }, { date: '2027-01-16', row: 51 }, true);
    const second = paintWeekRectangle(first, grid, { date: '2027-01-16', row: 51 }, { date: '2027-01-15', row: 50 }, false);
    expect(second.size).toBe(5);
    expect(second.has('2030-01-01T12:00:00Z')).toBe(true);
    expect(second.has('2027-01-15T12:00:00.000Z')).toBe(true);
    expect(second.has('2027-01-16T12:30:00.000Z')).toBe(false);
  });
  it('keeps skipped spring-forward rows disabled rather than shifting wall times', () => {
    const cells = [...dayCells('2027-03-14', 'America/New_York'), ...dayCells('2027-03-15', 'America/New_York')];
    const grid = buildWeekGrid(cells, 'America/New_York');
    const gapRow = grid.rows.findIndex(row => row.minute === 150);
    expect(grid.byDate.get('2027-03-14')![gapRow]).toBeNull();
    expect(grid.byDate.get('2027-03-15')![gapRow]?.label).toContain('2:30 AM');
    const selected = paintWeekRectangle(new Set(), grid, { date: '2027-03-14', row: gapRow }, { date: '2027-03-15', row: gapRow }, true);
    expect([...selected]).toEqual(['2027-03-15T06:30:00.000Z']);
  });
  it('preserves distinct fall-back instants and disables their extra rows on ordinary dates', () => {
    const grid = buildWeekGrid([...dayCells('2027-11-07', 'America/New_York'), ...dayCells('2027-11-08', 'America/New_York')], 'America/New_York');
    expect(grid.rows).toHaveLength(100);
    const repeatedRows = grid.rows.map((row, index) => ({ ...row, index })).filter(row => row.minute === 90);
    expect(repeatedRows).toHaveLength(2);
    const repeatedCells = repeatedRows.map(row => grid.byDate.get('2027-11-07')![row.index]!);
    expect(repeatedCells.map(cell => cell.offset)).toEqual(['-04:00', '-05:00']);
    expect(new Set(repeatedCells.map(cell => cell.start)).size).toBe(2);
    expect(grid.byDate.get('2027-11-08')![repeatedRows[1].index]).toBeNull();
  });
  it('retains clipped local dates and pages seven columns without losing the last partial date', () => {
    const cells = [...dayCells('2027-01-15', 'UTC'), ...dayCells('2027-01-16', 'UTC')];
    const grid = buildWeekGrid(cells, 'America/New_York');
    expect(grid.dates).toEqual(['2027-01-14', '2027-01-15', '2027-01-16']);
    expect(grid.byDate.get('2027-01-14')![0]).toBeNull();
    expect(grid.byDate.get('2027-01-14')![76]).not.toBeNull();
    expect(weekPageDates(['2027-01-14'], 1)).toEqual(['2027-01-21', '2027-01-22', '2027-01-23', '2027-01-24', '2027-01-25', '2027-01-26', '2027-01-27']);
  });
  it('marks private busy intervals only for strict overlap, including partial quarters', () => {
    const cell = { start: '2027-01-15T12:00:00Z', end: '2027-01-15T12:15:00Z' };
    expect(overlapsBusy(cell, [{ start: '2027-01-15T11:00:00Z', end: '2027-01-15T12:00:00Z' }])).toBe(false);
    expect(overlapsBusy(cell, [{ start: '2027-01-15T12:15:00Z', end: '2027-01-15T13:00:00Z' }])).toBe(false);
    expect(overlapsBusy(cell, [{ start: '2027-01-15T12:14:00Z', end: '2027-01-15T12:16:00Z' }])).toBe(true);
    expect(overlapsBusy(cell, [{ start: '2027-01-15T12:01:00Z', end: '2027-01-15T12:02:00Z' }])).toBe(true);
    expect(overlapsBusy(cell, [{ start: '2027-01-15T12:01:00Z', end: '2027-01-15T12:01:00Z' }])).toBe(false);
    expect(overlapsBusy(cell, [])).toBe(false);
  });
});
