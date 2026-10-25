'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildWeekGrid, overlapsBusy, paintWeekRectangle, weekPageDates, type WeekCell, type WeekCoordinate, type WeekRange } from './week-selection';
import styles from './weekly-calendar.module.css';

type Props = {
  cells: WeekRange[]; buckets: (WeekRange & { count: number })[]; selected: Set<string>;
  onChange: (next: Set<string>) => void; timezone: string; disabled: boolean;
  busy?: WeekRange[]; calendarKnown?: boolean; onWindowChange?: (window: WeekRange) => void;
};
type Drag = {
  pointerId: number; anchor: WeekCoordinate; baseline: Set<string>; enabled: boolean;
  x: number; y: number; lastTarget: string; moved: boolean;
};
const coordinateKey = (cell: WeekCoordinate) => `${cell.date}:${cell.row}`;
const clockLabel = (minute: number) => DateTime.utc(2000, 1, 1).plus({ minutes: minute }).toFormat('h a');

export default function WeeklyCalendar({ cells, buckets, selected, onChange, timezone, disabled, busy = [], calendarKnown, onWindowChange }: Props) {
  const grid = useMemo(() => buildWeekGrid(cells, timezone), [cells, timezone]);
  const [page, setPage] = useState(0);
  const [focusKey, setFocusKey] = useState('');
  const [today, setToday] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const animation = useRef<number | null>(null);
  const initializedZone = useRef('');
  const notifiedWindow = useRef('');
  const pageCount = Math.max(1, Math.ceil(grid.dates.length / 7));
  const currentPage = Math.min(page, pageCount - 1);
  const dates = weekPageDates(grid.dates, currentPage);
  const counts = useMemo(() => new Map(buckets.map(bucket => [bucket.start, bucket.count])), [buckets]);
  const highestCount = Math.max(1, ...buckets.map(bucket => bucket.count));
  const tenAmRow = grid.rows.findIndex(row => row.minute === 600 && row.fold === 0);
  const pageCells = dates.flatMap(date => grid.byDate.get(date)?.filter((cell): cell is WeekCell => cell !== null) ?? []);
  const defaultFocus = pageCells.find(cell => cell.row >= tenAmRow) ?? pageCells[0];
  const activeFocus = pageCells.some(cell => coordinateKey(cell) === focusKey) ? focusKey : defaultFocus ? coordinateKey(defaultFocus) : '';
  const windowStart = pageCells.length ? new Date(Math.min(...pageCells.map(cell => Date.parse(cell.start)))).toISOString() : '';
  const windowEnd = pageCells.length ? new Date(Math.max(...pageCells.map(cell => Date.parse(cell.end)))).toISOString() : '';

  // Read the clock after hydration so the server and first client render agree.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setToday(DateTime.now().setZone(timezone).toISODate() ?? ''));
    return () => cancelAnimationFrame(frame);
  }, [timezone]);

  useEffect(() => {
    if (!onWindowChange || !windowStart || !windowEnd) return;
    const key = `${timezone}:${windowStart}:${windowEnd}`;
    if (notifiedWindow.current === key) return;
    notifiedWindow.current = key;
    onWindowChange({ start: windowStart, end: windowEnd });
  }, [onWindowChange, timezone, windowStart, windowEnd]);

  useEffect(() => {
    if (initializedZone.current === timezone || !scrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      const target = canvasRef.current?.querySelector<HTMLButtonElement>(`[data-week-row="${tenAmRow}"]`);
      if (scroll && target) {
        scroll.scrollTop = Math.max(0, target.offsetTop - 64 - 12);
        initializedZone.current = timezone;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [timezone, tenAmRow, grid]);

  useEffect(() => {
    if (disabled) {
      drag.current = null;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
    }
    return () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
      drag.current = null;
    };
  }, [disabled]);

  function pointTarget(x: number, y: number): HTMLButtonElement | null {
    const scroll = scrollRef.current;
    if (!scroll) return null;
    const bounds = scroll.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.max(bounds.left + 65, Math.min(bounds.right - 5, x)),
      Math.max(bounds.top + 66, Math.min(bounds.bottom - 5, y)))?.closest<HTMLButtonElement>('[data-week-date][data-week-row]');
    return hit && canvasRef.current?.contains(hit) && !hit.disabled ? hit : null;
  }

  function paintAtPoint(x: number, y: number) {
    const active = drag.current;
    if (!active) return;
    const target = pointTarget(x, y);
    if (!target) return;
    const to = { date: target.dataset.weekDate!, row: Number(target.dataset.weekRow) };
    const key = coordinateKey(to);
    if (active.lastTarget === key) return;
    active.lastTarget = key;
    onChange(paintWeekRectangle(active.baseline, grid, active.anchor, to, active.enabled));
  }

  function autoScroll() {
    const active = drag.current, scroll = scrollRef.current;
    if (!active || !scroll) { animation.current = null; return; }
    const bounds = scroll.getBoundingClientRect();
    const oldTop = scroll.scrollTop, oldLeft = scroll.scrollLeft;
    if (active.moved && active.y < bounds.top + 90) scroll.scrollTop -= 10;
    else if (active.moved && active.y > bounds.bottom - 28) scroll.scrollTop += 10;
    if (active.moved && active.x < bounds.left + 88) scroll.scrollLeft -= 9;
    else if (active.moved && active.x > bounds.right - 25) scroll.scrollLeft += 9;
    if (oldTop !== scroll.scrollTop || oldLeft !== scroll.scrollLeft) paintAtPoint(active.x, active.y);
    animation.current = requestAnimationFrame(autoScroll);
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (disabled || drag.current || event.pointerType === 'mouse' && event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-week-date][data-week-row]');
    if (!button || button.disabled) return;
    const anchor = { date: button.dataset.weekDate!, row: Number(button.dataset.weekRow) };
    const cell = grid.byDate.get(anchor.date)?.[anchor.row];
    if (!cell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    button.focus({ preventScroll: true });
    drag.current = { pointerId: event.pointerId, anchor, baseline: new Set(selected), enabled: !selected.has(cell.start),
      x: event.clientX, y: event.clientY, lastTarget: coordinateKey(anchor), moved: false };
    onChange(paintWeekRectangle(selected, grid, anchor, anchor, !selected.has(cell.start)));
    animation.current = requestAnimationFrame(autoScroll);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || disabled) return;
    event.preventDefault();
    if (Math.abs(event.clientX - active.x) + Math.abs(event.clientY - active.y) > 3) active.moved = true;
    active.x = event.clientX; active.y = event.clientY;
    paintAtPoint(event.clientX, event.clientY);
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (cancelled) onChange(new Set(active.baseline));
    drag.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggle(cell: WeekCell) {
    if (!disabled) onChange(paintWeekRectangle(selected, grid, cell, cell, !selected.has(cell.start)));
  }

  function keyMove(event: KeyboardEvent<HTMLButtonElement>, cell: WeekCell) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    let column = dates.indexOf(cell.date) + direction[0], row = cell.row + direction[1];
    while (column >= 0 && column < dates.length && row >= 0 && row < grid.rows.length) {
      const target = grid.byDate.get(dates[column])?.[row];
      if (target) { buttons.current.get(coordinateKey(target))?.focus(); return; }
      column += direction[0]; row += direction[1];
    }
  }

  function changePage(next: number) {
    setPage(next); setFocusKey('');
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }

  function panDays(direction: number) {
    scrollRef.current?.scrollBy({ left: direction * 100, behavior: 'smooth' });
  }

  const firstDate = dates[0] ? DateTime.fromISO(dates[0], { zone: 'UTC' }) : null;
  const lastDate = dates.at(-1) ? DateTime.fromISO(dates.at(-1)!, { zone: 'UTC' }) : null;

  return <section className={styles.calendar} role="group" aria-label="Weekly availability calendar">
    <div className={styles.toolbar}>
      <h4>{firstDate?.toFormat('MMM d')}–{lastDate?.toFormat(firstDate?.hasSame(lastDate, 'month') ? 'd, yyyy' : 'MMM d, yyyy')}</h4>
      {pageCount > 1 && <div className={styles.weekNav}><button type="button" aria-label="Previous week" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={17} /></button>
        <span>{currentPage + 1} / {pageCount}</span><button type="button" aria-label="Next week" disabled={currentPage + 1 >= pageCount} onClick={() => changePage(currentPage + 1)}><ChevronRight size={17} /></button></div>}
    </div>
    <div className={styles.mobilePan}><button type="button" onClick={() => panDays(-1)} aria-label="Scroll days earlier"><ChevronLeft size={15} />Earlier days</button>
      <button type="button" onClick={() => panDays(1)} aria-label="Scroll days later">Later days<ChevronRight size={15} /></button></div>
    <div className={styles.scrollFrame} ref={scrollRef} data-testid="week-calendar-scroll" tabIndex={0} aria-label="Scroll weekly calendar">
      <div className={styles.canvas} ref={canvasRef} style={{ gridTemplateRows: `64px repeat(${grid.rows.length}, var(--quarter-height))` }}
        onPointerDown={begin} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => finish(event, true)}>
        <div className={styles.corner}><span>LOCAL<br />TIME</span></div>
        {dates.map(value => { const day = DateTime.fromISO(value, { zone: 'UTC' }); return <div key={value} className={`${styles.dayHeader} ${grid.byDate.has(value) ? '' : styles.outsideHeader} ${value === today ? styles.today : ''}`} aria-current={value === today ? 'date' : undefined}>
          <span>{day.toFormat('ccc')}</span><strong>{day.toFormat('d')}</strong></div>; })}
        {grid.rows.map((row, rowIndex) => <Fragment key={`${row.minute}-${row.fold}`}>
          <div className={`${styles.timeAxis} ${row.minute % 60 === 0 ? styles.hourAxis : ''}`}>
            {row.minute % 60 === 0 && <span>{clockLabel(row.minute)}{row.fold > 0 && <small>again</small>}</span>}
          </div>
          {dates.map(date => {
            const cell = grid.byDate.get(date)?.[rowIndex];
            if (!cell) return <div key={`${date}-${rowIndex}`} className={`${styles.unavailableCell} ${row.minute % 60 === 0 ? styles.hourLine : ''}`} aria-hidden="true" />;
            const chosen = selected.has(cell.start);
            const calendarBusy = overlapsBusy(cell, busy);
            const before = grid.byDate.get(date)?.[rowIndex - 1], after = grid.byDate.get(date)?.[rowIndex + 1];
            const startsBlock = chosen && (!before || !selected.has(before.start) || Date.parse(before.end) !== Date.parse(cell.start));
            const endsBlock = chosen && (!after || !selected.has(after.start) || Date.parse(cell.end) !== Date.parse(after.start));
            const count = counts.get(cell.start) ?? 0;
            const id = `week-count-${date}-${rowIndex}`;
            const instant = DateTime.fromISO(cell.start, { zone: timezone });
            const end = DateTime.fromISO(cell.end, { zone: timezone });
            return <button key={`${date}-${rowIndex}`} ref={element => { const key = coordinateKey(cell); if (element) buttons.current.set(key, element); else buttons.current.delete(key); }}
              type="button" className={`${styles.quarter} ${row.minute % 60 === 0 ? styles.hourLine : ''} ${calendarBusy ? styles.calendarBusy : ''} ${chosen ? styles.selected : ''} ${chosen && calendarBusy ? styles.selectedConflict : ''} ${startsBlock ? styles.selectionStart : ''} ${endsBlock ? styles.selectionEnd : ''}`}
              style={!chosen && !calendarBusy && count > 0 ? { backgroundColor: `rgba(50, 91, 142, ${0.045 + count / highestCount * 0.12})` } : undefined}
              aria-label={cell.label} aria-pressed={chosen} aria-describedby={id} disabled={disabled}
              tabIndex={!disabled && coordinateKey(cell) === activeFocus ? 0 : -1} data-week-date={date} data-week-row={rowIndex}
              onFocus={() => setFocusKey(coordinateKey(cell))} onKeyDown={event => keyMove(event, cell)}
              onClick={event => { if (event.detail === 0) toggle(cell); }}>
              {startsBlock && <span className={styles.blockTime}>{instant.toFormat('h:mm')}{row.fold > 0 && <small> {cell.offset}</small>}{endsBlock && `–${end.toFormat('h:mm')}`}</span>}
              {!startsBlock && endsBlock && <span className={styles.blockEnd}>{end.toFormat('h:mm')}</span>}
              {!chosen && calendarBusy && row.minute % 60 === 0 && <span className={styles.busyLabel} aria-hidden="true">Busy</span>}
              {!chosen && !calendarBusy && count > 0 && row.minute % 60 === 0 && <span className={styles.count} aria-hidden="true">{count}</span>}
              <span id={id} className={styles.visuallyHidden}>{count} {count === 1 ? 'response' : 'responses'} available{calendarBusy ? '; Your calendar: busy. You can still choose this time.' : ''}{row.fold > 0 ? `; repeated hour, offset ${cell.offset}` : ''}</span>
            </button>;
          })}
        </Fragment>)}
      </div>
    </div>
    <div className={styles.legend}><span><i className={styles.selectedSwatch} />Your availability</span><span><i className={styles.overlapSwatch} />Group overlap</span>
      {(calendarKnown || busy.length > 0) && <span><i className={styles.busySwatch} />Your calendar: busy · only you</span>}<span className={styles.zone}>{timezone.replaceAll('_', ' ')}</span></div>
    <details className={styles.help}><summary>Help</summary><p>Drag across days to select the same hours on each. Scroll the time labels to move through the day; swipe the headings to see more dates. Use arrow keys to move and Enter or Space to select.</p>
      {(calendarKnown || busy.length > 0) && <p>Grey blocks are from your calendar, visible only to you. You can still select a busy time.</p>}</details>
  </section>;
}
