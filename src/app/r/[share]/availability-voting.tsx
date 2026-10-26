'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Users } from 'lucide-react';
import type { AvailabilityPollView } from '@/features/availability/service';
import { browserGuestKey } from '@/features/availability/browser-identity';
import { pictureSubmission, type PictureDraft } from '@/features/profile-pictures/schema';
import { ProfilePicture } from '@/components/profile-picture';
import { ProfilePicturePicker } from '@/components/profile-picture-picker';
import { dateCells, filterTimeCells, paintSelection, parseWallTime, rangesToSelection, selectionToRanges, type SelectionRange, type TimeSection } from './selection';
import styles from './availability.module.css';
import WeeklyCalendar from './weekly-calendar';
import CalendarReferencePanel from './calendar-reference';
import { overlapsBusy } from './week-selection';
import { availabilityDraftKey, clearAvailabilityDraft, draftBaseFingerprint, readAvailabilityDraft, writeAvailabilityDraft } from './availability-draft';

type Drag = { pointerId: number; from: number; enabled: boolean; baseline: Set<string> };
const localDate = (instant: string, zone: string) => DateTime.fromISO(instant, { zone }).toISODate()!;
const readableError = (value: unknown) => typeof value === 'object' && value !== null && 'error' in value
  && typeof value.error === 'object' && value.error !== null && 'message' in value.error && typeof value.error.message === 'string'
  ? value.error.message : 'Your availability could not be saved. Please try again.';

function displayRange(range: SelectionRange, timed: boolean, zone: string) {
  if (timed) {
    const start = DateTime.fromISO(range.start, { zone });
    const end = DateTime.fromISO(range.end, { zone });
    return `${start.toFormat('EEE, MMM d · h:mm a')}–${end.toFormat(start.hasSame(end, 'day') ? 'h:mm a' : 'EEE, MMM d · h:mm a')}`;
  }
  const start = DateTime.fromISO(range.start, { zone: 'UTC' });
  const last = DateTime.fromISO(range.end, { zone: 'UTC' }).minus({ days: 1 });
  return start.hasSame(last, 'day') ? start.toFormat('EEE, MMM d') : `${start.toFormat('MMM d')}–${last.toFormat('MMM d')}`;
}

export default function AvailabilityVoting({ share, initial, signedIn = false }: { share: string; initial: AvailabilityPollView; signedIn?: boolean }) {
  const [poll, setPoll] = useState(initial);
  const timed = ['day', 'week', 'fortnight'].includes(poll.scale);
  const weekly = poll.scale === 'week' || poll.scale === 'fortnight';
  const allCells = useMemo<SelectionRange[]>(() => timed
    ? poll.buckets.map(({ start, end }) => ({ start, end })) : dateCells(poll.startDate, poll.endDate), [timed, poll.buckets, poll.startDate, poll.endDate]);
  const [name, setName] = useState(initial.ownResponse?.name ?? '');
  const [picture, setPicture] = useState<PictureDraft>(initial.ownResponse?.picture ?? null);
  const [selected, setSelected] = useState(() => rangesToSelection(initial.buckets, initial.ownResponse?.ranges ?? []));
  const [viewZone, setViewZone] = useState(poll.timezone);
  const [chosenDate, setChosenDate] = useState(poll.startDate);
  const [timeSection, setTimeSection] = useState<TimeSection>('afternoon');
  const [month, setMonth] = useState(() => DateTime.fromISO(initial.startDate, { zone: 'UTC' }).startOf('month').toISODate()!);
  const [from, setFrom] = useState('12:00');
  const [until, setUntil] = useState('13:00');
  const [saving, setSaving] = useState(false);
  const [savingVote, setSavingVote] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(initial.ownResponse !== null);
  const [dirty, setDirty] = useState(false);
  const [revealNames, setRevealNames] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [weekWindow, setWeekWindow] = useState<SelectionRange | null>(null);
  const [calendar, setCalendar] = useState<{ busy: SelectionRange[]; known: boolean }>({ busy: [], known: false });
  const calendarChanged = useCallback((busy: SelectionRange[], known: boolean) => setCalendar({ busy, known }), []);
  const weekWindowChanged = useCallback((next: SelectionRange) => setWeekWindow(previous => previous?.start === next.start && previous?.end === next.end ? previous : next), []);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const requestRevision = useRef(0);
  const [draftInitial] = useState(() => {
    const selected = rangesToSelection(initial.buckets, initial.ownResponse?.ranges ?? []);
    const name = initial.ownResponse?.name ?? '';
    const picture = initial.ownResponse?.picture ?? null;
    return { cells: initial.buckets, name, selected, picture, closed: initial.closed,
      base: draftBaseFingerprint(initial.ownResponse ? { name, selected, picture } : null) };
  });
  const draftKeyRef = useRef<string | null>(null);
  const draftBaseRef = useRef(draftInitial.base);
  const draftStateRef = useRef({ name: draftInitial.name, selected: draftInitial.selected, picture: draftInitial.picture as PictureDraft });
  const drag = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const basePath = `/api/venns/${encodeURIComponent(share)}`;

  const dates = useMemo(() => timed ? [...new Set(allCells.map(cell => localDate(cell.start, viewZone)))]
    : allCells.map(cell => cell.start), [allCells, timed, viewZone]);
  const date = dates.includes(chosenDate) ? chosenDate : dates[0] ?? poll.startDate;
  const visibleCells = useMemo(() => timed ? filterTimeCells(allCells.filter(cell => localDate(cell.start, viewZone) === date), viewZone, timeSection)
    : [], [allCells, timed, date, viewZone, timeSection]);
  const monthStart = DateTime.fromISO(month, { zone: 'UTC' });
  const monthDates = dateCells(month, monthStart.endOf('month').toISODate()!);
  const selectedRanges = useMemo(() => selectionToRanges(allCells, selected), [allCells, selected]);
  const calendarWindow = useMemo<SelectionRange | null>(() => {
    if (weekly) return weekWindow;
    if (timed) {
      const cells = allCells.filter(cell => localDate(cell.start, viewZone) === date);
      return cells.length ? { start: cells[0].start, end: cells.at(-1)!.end } : null;
    }
    const start = DateTime.max(DateTime.fromISO(month, { zone: poll.timezone }), DateTime.fromISO(poll.startDate, { zone: poll.timezone }));
    const end = DateTime.min(DateTime.fromISO(month, { zone: poll.timezone }).plus({ months: 1 }), DateTime.fromISO(poll.endDate, { zone: poll.timezone }).plus({ days: 1 }));
    return start < end ? { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! } : null;
  }, [weekly, weekWindow, timed, allCells, viewZone, date, month, poll.timezone, poll.startDate, poll.endDate]);
  const canEdit = !poll.closed && !saving && !unavailable;
  const ownResponse = poll.ownResponse !== null;

  useEffect(() => {
    let active = true;
    const flush = () => {
      if (!dirtyRef.current || !draftKeyRef.current) return;
      try { writeAvailabilityDraft(sessionStorage, draftKeyRef.current, { ...draftStateRef.current, base: draftBaseRef.current }); }
      catch { /* A blocked storage getter must not affect voting. */ }
    };
    void availabilityDraftKey(share).then(key => {
      if (!active) return;
      draftKeyRef.current = key;
      if (dirtyRef.current) { flush(); return; }
      try {
        if (draftInitial.closed) { clearAvailabilityDraft(sessionStorage, key); return; }
        const draft = readAvailabilityDraft(sessionStorage, key, draftInitial.cells, draftInitial.base);
        if (!draft) return;
        const restored = new Set(draft.selected);
        const restoredPicture = draft.picture === undefined ? draftInitial.picture : draft.picture;
        draftStateRef.current = { name: draft.name, selected: restored, picture: restoredPicture };
        dirtyRef.current = true; requestRevision.current++;
        setName(draft.name); setSelected(restored); setPicture(restoredPicture); setDirty(true); setSaveConfirmed(false);
        setMessage('Unsaved choices restored.');
      } catch { /* Draft recovery is optional; the response form stays usable. */ }
    }).catch(() => { /* Crypto or storage can be unavailable without blocking a response. */ });
    window.addEventListener('pagehide', flush);
    return () => { active = false; window.removeEventListener('pagehide', flush); };
  }, [share, draftInitial]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (viewerZone) setViewZone(viewerZone);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || savingRef.current || refreshing) return;
      refreshing = true;
      const revision = requestRevision.current;
      try {
        const response = await fetch(`${basePath}${revealNames ? '?names=1' : ''}`, { cache: 'no-store' });
        const value = await response.json();
        if (!active || savingRef.current || revision !== requestRevision.current) return;
        if (response.ok) {
          const next = value as AvailabilityPollView;
          setPoll(next);
          if (!dirtyRef.current && !savingRef.current) {
            const nextName = next.ownResponse?.name ?? '';
            const nextSelection = rangesToSelection(next.buckets, next.ownResponse?.ranges ?? []);
            const nextPicture = next.ownResponse?.picture ?? null;
            setName(nextName); setSelected(nextSelection); setPicture(nextPicture);
            draftBaseRef.current = draftBaseFingerprint(next.ownResponse ? { name: nextName, selected: nextSelection, picture: nextPicture } : null);
            draftStateRef.current = { name: nextName, selected: nextSelection, picture: nextPicture };
          }
        } else if ([404, 410].includes(response.status)) { setUnavailable(true); setError(readableError(value)); }
      } catch { /* A temporary refresh failure keeps the last observed results and all edits. */ }
      finally { refreshing = false; }
    };
    const timer = setInterval(refresh, 5_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    if (revealNames) void refresh();
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [basePath, revealNames]);

  function markDirty() { dirtyRef.current = true; setDirty(true); setSaveConfirmed(false); setMessage(''); }
  function persistDraft(nextName: string, nextSelection: Set<string>, nextPicture: PictureDraft = picture) {
    draftStateRef.current = { name: nextName, selected: nextSelection, picture: nextPicture };
    if (!draftKeyRef.current) return;
    try { writeAvailabilityDraft(sessionStorage, draftKeyRef.current, { name: nextName, selected: nextSelection, picture: nextPicture, base: draftBaseRef.current }); }
    catch { /* The site works when session storage is blocked. */ }
  }
  function updateSelection(next: Set<string>) { markDirty(); setSelected(next); persistDraft(name, next); }
  function updateName(next: string) { markDirty(); setName(next); persistDraft(next, selected); }
  function updatePicture(next: PictureDraft) { markDirty(); setPicture(next); persistDraft(name, selected, next); }

  function pointerStart(event: PointerEvent<HTMLDivElement>) {
    if (!canEdit || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cell-index]');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.cellIndex);
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    button.focus({ preventScroll: true });
    const baseline = new Set(selected);
    const enabled = !selected.has(allCells[index].start);
    drag.current = { pointerId: event.pointerId, from: index, enabled, baseline };
    updateSelection(paintSelection(baseline, allCells, index, index, enabled));
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !canEdit) return;
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-cell-index]');
    if (!button || !gridRef.current?.contains(button) || button.disabled) return;
    event.preventDefault();
    updateSelection(paintSelection(active.baseline, allCells, active.from, Number(button.dataset.cellIndex), active.enabled));
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggle(index: number) {
    if (!canEdit) return;
    updateSelection(paintSelection(selected, allCells, index, index, !selected.has(allCells[index].start)));
  }

  function addTime() {
    const start = parseWallTime(date, from, viewZone);
    const end = parseWallTime(date, until, viewZone);
    if (!start || !end) {
      setError('A clock change affects that time. Pick another time or use the grid.'); return;
    }
    if (end <= start || start.minute % 15 !== 0 || end.minute % 15 !== 0) {
      setError('Use 15-minute steps, with the end after the start.'); return;
    }
    const cells = allCells.filter(cell => Date.parse(cell.start) >= start.toMillis() && Date.parse(cell.end) <= end.toMillis());
    if (!cells.length || Date.parse(cells[0].start) !== start.toMillis() || Date.parse(cells.at(-1)!.end) !== end.toMillis()) {
      setError('Choose times inside this Venn’s planning window.'); return;
    }
    setError(''); updateSelection(new Set([...selected, ...cells.map(cell => cell.start)]));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true); setSavingVote(true); setSaveConfirmed(false); savingRef.current = true; requestRevision.current++; setError(''); setMessage('');
    try {
      const guestKey = await browserGuestKey();
      const response = await fetch(`${basePath}/availability`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Venn-Guest-Key': guestKey },
        body: JSON.stringify({ name: name.trim(), ranges: selectedRanges, picture: pictureSubmission(picture) }) });
      const value = await response.json();
      if (!response.ok) {
        if (response.status === 410) setPoll(previous => ({ ...previous, closed: true }));
        throw new Error(readableError(value));
      }
      const next = value as AvailabilityPollView;
      setPoll(next); setName(next.ownResponse?.name ?? name);
      const nextSelection = rangesToSelection(next.buckets, next.ownResponse?.ranges ?? []);
      const nextPicture = next.ownResponse?.picture ?? null;
      setSelected(nextSelection); setPicture(nextPicture);
      draftBaseRef.current = draftBaseFingerprint(next.ownResponse ? { name: next.ownResponse.name, selected: nextSelection, picture: nextPicture } : null);
      draftStateRef.current = { name: next.ownResponse?.name ?? name, selected: nextSelection, picture: nextPicture };
      if (draftKeyRef.current) {
        try { clearAvailabilityDraft(sessionStorage, draftKeyRef.current); } catch { /* Saving is already complete. */ }
      }
      dirtyRef.current = false; setDirty(false);
      setSaveConfirmed(true); setMessage('Saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your availability could not be saved. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); setSavingVote(false); }
  }

  async function close() {
    setSaving(true); savingRef.current = true; requestRevision.current++; setError('');
    try {
      const response = await fetch(`${basePath}/close`, { method: 'POST' });
      const value = await response.json();
      if (!response.ok) throw new Error(readableError(value));
      setPoll(value); setMessage('Voting closed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Voting could not be closed.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function cellButton(cell: SelectionRange, label: string, content: React.ReactNode) {
    const index = allCells.findIndex(item => item.start === cell.start);
    const bucket = poll.buckets.find(item => item.start === cell.start);
    const privateBusy = calendar.known && overlapsBusy(timed ? cell : {
      start: DateTime.fromISO(cell.start, { zone: poll.timezone }).toUTC().toISO()!,
      end: DateTime.fromISO(cell.end, { zone: poll.timezone }).toUTC().toISO()!,
    }, calendar.busy);
    return <button key={cell.start} type="button" data-cell-index={index} aria-label={label}
      aria-pressed={selected.has(cell.start)} aria-describedby={[bucket && bucket.count > 0 ? `availability-count-${index}` : '', privateBusy ? `private-busy-${index}` : ''].filter(Boolean).join(' ') || undefined} disabled={!canEdit || index < 0}
      className={`${styles.cell} ${selected.has(cell.start) ? styles.selectedCell : ''} ${privateBusy ? styles.privateBusy : ''}`}
      onClick={event => { if (event.detail === 0) toggle(index); }}>
      {content}{bucket && bucket.count > 0 && <span id={`availability-count-${index}`} className={styles.cellCount}>{bucket.count}<span className={styles.visuallyHidden}> available</span></span>}
      {privateBusy && <span id={`private-busy-${index}`} className={styles.privateBusyLabel}>{timed ? 'Busy' : 'Events'}<span className={styles.visuallyHidden}> · Your calendar: busy, only visible to you. You can still choose this {timed ? 'time' : 'date'}.</span></span>}
    </button>;
  }

  return <section className={styles.root} aria-labelledby="availability-heading">
    <header className={styles.meta}>
      <h2 id="availability-heading"><CalendarDays size={14} aria-hidden="true" />{DateTime.fromISO(poll.startDate).toFormat('MMM d')}{poll.startDate !== poll.endDate && ` – ${DateTime.fromISO(poll.endDate).toFormat('MMM d, yyyy')}`}</h2>
      <p className={styles.deadline}><Clock3 size={14} aria-hidden="true" />{poll.closed ? 'Voting closed' : `Closes ${DateTime.fromISO(poll.closesAt, { zone: poll.timezone }).toFormat('MMM d, h:mm a ZZZZ')}`}</p>
      <span className={styles.respondents}><Users size={14} aria-hidden="true" />{poll.respondentCount} {poll.respondentCount === 1 ? 'response' : 'responses'}</span>
    </header>
    <form onSubmit={save} aria-busy={saving} className={`${styles.card} ${weekly ? styles.weeklyCard : ''}`}>
      <div className={styles.formHeading}><h3>Your availability</h3>{!poll.closed && <p>Drag to select. Tap to undo.</p>}</div>
      <div className={timed ? styles.controlRow : undefined}>
        <label className={styles.field}><span>Your name</span><input required maxLength={40} value={name} onChange={event => updateName(event.target.value)} disabled={!canEdit} placeholder="e.g. Sam" autoComplete="given-name" /></label>
        {timed && <label className={styles.field}><span>Times shown in</span><select aria-label="Times shown in" value={viewZone} onChange={event => setViewZone(event.target.value)}>
          {[...new Set([viewZone, poll.timezone, 'UTC'])].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select></label>}
      </div>
      <ProfilePicturePicker share={share} value={picture} onChange={updatePicture} disabled={!canEdit} name={name} />
      <CalendarReferencePanel share={share} window={calendarWindow} signedIn={signedIn} onChange={calendarChanged} />
      {timed ? <>
        {!weekly && <div className={styles.controlRow}>
          <label className={styles.field}><span>Date</span><select aria-label="Date" value={date} onChange={event => setChosenDate(event.target.value)} disabled={unavailable}>
            {dates.map(value => <option key={value} value={value}>{DateTime.fromISO(value).toFormat('EEE, MMM d')}</option>)}
          </select></label>
          <label className={styles.field}><span>Time of day</span><select aria-label="Time of day" value={timeSection} onChange={event => setTimeSection(event.target.value as TimeSection)}>
            <option value="overnight">Overnight · 12–6 am</option><option value="morning">Morning · 6 am–noon</option>
            <option value="afternoon">Afternoon · noon–6 pm</option><option value="evening">Evening · 6 pm–12 am</option><option value="all">Whole day</option>
          </select></label>
        </div>}
        {viewZone !== poll.timezone && <p className={styles.hint}>Organizer: {poll.timezone.replaceAll('_', ' ')}</p>}
        {weekly && <WeeklyCalendar cells={allCells} buckets={poll.buckets} selected={selected} onChange={updateSelection} timezone={viewZone} disabled={!canEdit}
          busy={calendar.busy} calendarKnown={calendar.known} onWindowChange={weekWindowChanged} />}
        {!weekly && <div className={styles.timePicker} ref={gridRef} role="group" aria-label="Drag to select times"
          onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
          {visibleCells.map(cell => {
            const instant = DateTime.fromISO(cell.start, { zone: viewZone });
            return cellButton(cell, `Select ${instant.toFormat('yyyy-MM-dd h:mm a ZZ')}`, <><span>{instant.toFormat('h:mm a')}</span>
              {instant.getPossibleOffsets().length > 1 && <span className={styles.cellOffset}>{instant.toFormat('ZZ')}</span>}</>);
          })}
        </div>}
        <details className={styles.timeAlternative}>
          <summary>Or enter a time window</summary>
          {weekly && <label className={styles.field} style={{ marginTop: 16 }}><span>Date</span><select aria-label="Date" value={date} onChange={event => setChosenDate(event.target.value)} disabled={!canEdit}>
            {dates.map(value => <option key={value} value={value}>{DateTime.fromISO(value).toFormat('EEE, MMM d')}</option>)}
          </select></label>}
          <div className={styles.controlRow}>
            <label className={styles.field}><span>Available from</span><input type="time" step={900} value={from} onChange={event => setFrom(event.target.value)} disabled={!canEdit} /></label>
            <label className={styles.field}><span>Available until</span><input type="time" step={900} value={until} onChange={event => setUntil(event.target.value)} disabled={!canEdit} /></label>
          </div>
          <button className={styles.secondary} type="button" disabled={!canEdit} onClick={addTime}>Add this time</button>
        </details>
      </> : <div className={styles.calendar}>
        <div className={styles.monthNav}><button type="button" aria-label="Previous month" className={styles.monthButton}
          disabled={monthStart <= DateTime.fromISO(poll.startDate, { zone: 'UTC' }).startOf('month')}
          onClick={() => setMonth(monthStart.minus({ months: 1 }).toISODate()!)}><ChevronLeft size={18} /></button>
          <h4>{monthStart.toFormat('MMMM yyyy')}</h4>
          <button type="button" aria-label="Next month" className={styles.monthButton}
            disabled={monthStart >= DateTime.fromISO(poll.endDate, { zone: 'UTC' }).startOf('month')}
            onClick={() => setMonth(monthStart.plus({ months: 1 }).toISODate()!)}><ChevronRight size={18} /></button></div>
        <div className={styles.weekdays} aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((value, index) => <span key={index}>{value}</span>)}</div>
        <div className={styles.datePicker} ref={gridRef} role="group" aria-label="Drag to select dates"
          onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
          {Array.from({ length: monthStart.weekday - 1 }, (_, index) => <span key={`empty-${index}`} />)}
          {monthDates.map(cell => cellButton(cell, `Select ${cell.start}`, <span>{DateTime.fromISO(cell.start).day}</span>))}
        </div>
        <p className={styles.hint}>Whole days · {poll.timezone.replaceAll('_', ' ')}</p>
      </div>}
      {!weekly && <details className={styles.help}><summary>Help</summary><p>{timed ? 'Choose a date, then drag over 15-minute blocks. Use a different time-of-day section for other hours; selections stay in place.' : 'Choose whole dates now. Set exact times closer to the plan.'} Use Tab to move between choices and Enter or Space to select.</p></details>}
      <div className={styles.selectionSummary}>
        <strong>{selected.size > 0 ? `${timed ? selectedRanges.length : selected.size} ${timed ? (selectedRanges.length === 1 ? 'time window' : 'time windows') : (selected.size === 1 ? 'date' : 'dates')} selected` : 'Nothing selected'}</strong>
        {canEdit && selected.size > 0 && <button type="button" className={styles.textButton} onClick={() => updateSelection(new Set())}>Clear</button>}
      </div>
      {selectedRanges.length > 0 && <ul className={styles.chips} aria-label="Your selected availability">{selectedRanges.map(range => <li key={range.start}>{displayRange(range, timed, viewZone)}</li>)}</ul>}
      {selected.size === 0 && !poll.closed && <p className={styles.hint}>Unavailable? Save without selecting a time.</p>}
      <div className={styles.saveRow}><button type="submit" aria-label="Save availability" aria-busy={savingVote}
        className={`${styles.primary} ${saveConfirmed ? styles.savedButton : ''} ${savingVote ? styles.savingButton : ''}`} disabled={!canEdit}>
        {savingVote ? <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> : saveConfirmed ? <Check size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
        {savingVote ? 'Saving…' : saveConfirmed ? 'Saved' : 'Save availability'}</button>
        {dirty && <span className={styles.hint}>Unsaved changes</span>}</div>
      <p role="status" aria-live="polite" className={message === 'Saved.' ? styles.visuallyHidden : styles.status}>{message}</p>
      {error && <div role="alert" className={styles.error}><p>{error}</p>{canEdit && <button type="submit" className={styles.retry}>Try again</button>}</div>}
    </form>

    <section className={styles.overlap} aria-labelledby="overlap-heading">
      <div className={styles.sectionHeading}><h3 id="overlap-heading">Your overlap</h3><span className={styles.live}><span />Live</span></div>
      {poll.best.length > 0 ? <ol className={styles.best}>{poll.best.map((range, index) => <li key={range.start}>
        <div><span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span><strong>{displayRange(range, timed, viewZone)}</strong></div>
        <span>{range.count} of {poll.respondentCount} available</span>
        <div className={styles.bar} aria-hidden="true"><span style={{ width: `${poll.respondentCount ? range.count / poll.respondentCount * 100 : 0}%` }} /></div>
      </li>)}</ol> : <div className={styles.emptyOverlap}><p>{poll.respondentCount ? 'No overlap yet. More answers may help.' : 'Waiting for the first answer.'}</p></div>}
      {ownResponse && <div className={styles.names}>
        <label><input type="checkbox" checked={revealNames} onChange={event => setRevealNames(event.target.checked)} />See who has answered</label>
        {revealNames && <ul aria-label="Respondents">{(poll.respondents ?? poll.names?.map(name => ({ name, picture: null })))?.map((person, index) =>
          <li key={`${person.name}-${index}`}><ProfilePicture share={share} picture={person.picture} name={person.name} size={34} decorative /><span>{person.name}</span></li>)}</ul>}
      </div>}
      {poll.isOwner && !poll.closed && <div className={styles.owner}><span>Have enough answers?</span><button type="button" className={styles.textButton} disabled={saving} onClick={close}>Close voting early</button></div>}
    </section>

    {ownResponse && <aside className={styles.cta} aria-labelledby="make-your-own-heading">
      <div><h3 id="make-your-own-heading">Love using Venn?</h3></div>
      <Link href="/signup" className={styles.ctaLink}>Make your own Venn <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </aside>}
  </section>;
}
