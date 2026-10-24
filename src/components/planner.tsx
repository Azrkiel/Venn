'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Copy, FlaskConical, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { createDemoScenario, DEMO_ACTIVITIES, DEMO_GROUPS, formatDemoRange, makeDemoDraft, type DemoActivity, type DemoGroupId, type DemoScenarioInput } from '@/features/demo/scenario';
import { VennMark } from './venn-mark';
import { GroupAvatars } from './group-avatars';
import { DayCard } from './day-card';
import { SlotOption } from './slot-option';

type Stage = 'plan' | 'options' | 'reply';
const defaultZone = 'America/New_York';

export function Planner({ initialDate }: { initialDate: string }) {
  const initial: DemoScenarioInput = { date: initialDate, timeZone: defaultZone, activity: 'lunch', groupId: 'lunch-crew', requesterId: 'sam', friendBusy: false };
  const [form, setForm] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [stage, setStage] = useState<Stage>('plan');
  const [selected, setSelected] = useState<number | null>(null);
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<HTMLHeadingElement>(null);
  const scenario = useMemo(() => createDemoScenario(applied), [applied]);
  const selectedSlot = selected === null ? undefined : scenario.slots[selected];
  const draft = draftEdit ?? (selected === null ? '' : makeDemoDraft(scenario.slots, selected, applied.timeZone));
  const formGroup = DEMO_GROUPS.find(group => group.id === form.groupId)!;

  function goTo(next: Stage) {
    setStage(next); setNotice('');
    requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
  }

  function resetScenario() {
    setForm(initial); setApplied(initial); setSelected(null); setDraftEdit(null);
    setCopied(false); setNotice(''); setStage('options');
  }

  function selectOption(index: number) {
    if (selected !== index) setDraftEdit(null);
    setSelected(index); setCopied(false); goTo('reply');
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true); setNotice('Copied. It’s yours to send.');
    } catch {
      draftRef.current?.focus(); draftRef.current?.select();
      setNotice('Select the reply and copy it manually.');
    }
  }

  function changeScenario(change: Partial<DemoScenarioInput>) {
    setApplied(current => ({ ...current, ...change }));
    setForm(current => ({ ...current, ...change }));
    setSelected(null); setDraftEdit(null); setCopied(false); setNotice('');
  }

  return (
    <div className="site-shell planner-shell">
      <a className="skip-link" href="#planner">Skip to planning</a>
      <header className="site-header">
        <Link className="brand" href="/app" aria-label="Venn home"><VennMark /><span>venn</span></Link>
        <nav className="header-nav" aria-label="Main navigation"><a href="#planner" aria-current="page">Sample planner</a><Link href="/live">Live planner</Link></nav>
      </header>
      <main className="main-wrap">
        <div className="sample-banner"><div><FlaskConical size={14} /><span><strong>Sample calendars</strong><span className="sample-banner-detail"> · No real accounts connected.</span></span></div><Link href="/setup">Connect yours <ArrowRight size={13} /></Link></div>
        {stage === 'plan' && <section className="page-intro" aria-labelledby="page-title"><div><p className="eyebrow">LET’S FIND A TIME, TOGETHER.</p><h1 id="page-title">Make room for <span>your people.</span></h1></div></section>}
        <div className="planner-flow" id="planner" data-stage={stage}>
          {stage === 'plan' && <section className="plan-card plan-stage" aria-labelledby="plan-heading">
            <div className="flow-card-heading"><h2 id="plan-heading" ref={stageRef} tabIndex={-1}>What’s the plan?</h2></div>
            <form className="plan-form" onSubmit={event => {
              event.preventDefault(); setApplied({ ...form }); setSelected(null);
              setDraftEdit(null); setCopied(false); goTo('options');
            }}>
              <div className="form-row essential-fields">
                <label className="form-field"><span><Users size={13} /> With who</span><span className="select-wrap"><select value={form.groupId} onChange={event => {
                  const groupId = event.target.value as DemoGroupId;
                  const group = DEMO_GROUPS.find(group => group.id === groupId)!;
                  setForm(current => ({ ...current, groupId, requesterId: group.people[1].id }));
                }}><option value="lunch-crew">Lunch crew</option><option value="roommates">Roommates</option></select><ChevronDown size={14} /></span></label>
                <label className="form-field"><span>Make time for</span><span className="select-wrap"><select value={form.activity} onChange={event => setForm(current => ({ ...current, activity: event.target.value as DemoActivity }))}>{Object.entries(DEMO_ACTIVITIES).map(([key, activity]) => <option key={key} value={key}>{activity.label} · {activity.duration} min</option>)}</select><ChevronDown size={14} /></span></label>
                <label className="form-field"><span><CalendarDays size={13} /> On which day</span><input aria-label="On which day" type="date" required value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
              </div>
              <details className="more-options">
                <summary>More options <ChevronDown size={14} /></summary>
                <div className="form-row optional-fields">
                  <label className="form-field"><span>Who’s asking?</span><span className="select-wrap"><select value={form.requesterId} onChange={event => setForm(current => ({ ...current, requesterId: event.target.value }))}>{formGroup.people.filter(person => person.connected).map(person => <option key={person.id} value={person.id}>{person.name === 'You' ? 'Me' : person.name}</option>)}</select><ChevronDown size={14} /></span></label>
                  <label className="form-field"><span>Your time zone</span><span className="select-wrap"><select value={form.timeZone} onChange={event => setForm(current => ({ ...current, timeZone: event.target.value }))}><option value="America/New_York">New York</option><option value="America/Los_Angeles">Los Angeles</option><option value="Europe/London">London</option></select><ChevronDown size={14} /></span></label>
                </div>
              </details>
              <button className="primary-button find-button" type="submit">Find our overlap <ArrowRight size={16} /></button>
            </form>
          </section>}
          {stage === 'options' && <section className="plan-card options-stage" aria-labelledby="options-heading">
            <button className="flow-back" onClick={() => goTo('plan')}><ArrowLeft size={14} /> Edit plan</button>
            <div className="flow-card-heading"><div><p className="section-kicker">{scenario.day.toFormat('cccc, LLLL d').toUpperCase()}</p><h1 id="options-heading" ref={stageRef} tabIndex={-1}>{scenario.slots.length ? 'Here’s your overlap.' : 'No window fits this time.'}</h1></div><GroupAvatars people={scenario.people} /></div>
            <p className="flow-summary">{scenario.groupName} · {scenario.activity.label.toLowerCase()} · {scenario.activity.duration} minutes</p>
            <div className="slot-list" aria-live="polite" aria-label="Suggested times">
              {scenario.slots.map((slot, index) => <SlotOption key={`${slot.start}-${slot.end}`} slot={slot} people={scenario.people} index={index} selected={selected === index} timeZone={applied.timeZone} onSelect={() => selectOption(index)} />)}
              {scenario.slots.length === 0 && <div className="empty-state"><CalendarDays size={24} /><p>A little room on another day?</p><span>Try a different day or a shorter activity.</span><button className="secondary-button" onClick={() => goTo('plan')}>Change the plan <ArrowRight size={14} /></button></div>}
            </div>
            <details className="flow-disclosure overlap-disclosure"><summary>See the overlap <ChevronDown size={14} /></summary><DayCard scenario={scenario} timeZone={applied.timeZone} />{scenario.people.some(person => !person.connected) && <p className="flow-detail-note">Lee hasn’t connected a calendar. Their time is unknown, never counted as free.</p>}</details>
            <details className="flow-disclosure scenario-disclosure"><summary>Try a different situation <ChevronDown size={14} /></summary><div className="scenario-controls">
              <label className="conflict-control"><span><strong>{scenario.people[2].name} gets busy</strong><small>Add a sample conflict around {applied.activity}.</small></span><input type="checkbox" checked={applied.friendBusy} onChange={() => changeScenario({ friendBusy: !applied.friendBusy })} data-testid="demo-conflict-toggle" /><span className="toggle-track" aria-hidden="true"><span /></span></label>
              <label className="conflict-control"><span><strong>Your day fills up</strong><small>See what happens when nothing fits.</small></span><input type="checkbox" checked={!!applied.ownerBooked} onChange={() => changeScenario({ ownerBooked: !applied.ownerBooked })} /><span className="toggle-track" aria-hidden="true"><span /></span></label>
              <button className="reset-button" onClick={resetScenario}><RotateCcw size={12} /> Reset sample</button>
            </div></details>
          </section>}
          {stage === 'reply' && selectedSlot && <section className="plan-card focused-reply" aria-labelledby="reply-heading">
            <button className="flow-back" onClick={() => goTo('options')}><ArrowLeft size={14} /> Back to options</button>
            <div className="flow-card-heading"><h1 id="reply-heading" ref={stageRef} tabIndex={-1}>Sounds like a plan.</h1></div>
            <p className="flow-summary">{scenario.day.toFormat('ccc, LLL d')} · {formatDemoRange(selectedSlot, applied.timeZone)}</p>
            <label className="draft-label" htmlFor="reply-draft">Make this reply yours</label>
            <textarea ref={draftRef} id="reply-draft" aria-label="Your editable reply" className="reply-draft" value={draft} onChange={event => { setDraftEdit(event.target.value); setCopied(false); setNotice(''); }} rows={3} spellCheck />
            <button className="primary-button copy-button" onClick={copyReply} disabled={!draft.trim()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied. All yours.' : 'Copy reply'}<ArrowRight size={15} /></button>
            <p className="copy-notice" role="status">{notice || <><ShieldCheck size={12} /> Only you send this. Always.</>}</p>
            <button className="text-button cancel-button" onClick={() => { setDraftEdit(null); setCopied(false); goTo('plan'); }}>Not this time</button>
          </section>}
        </div>
      </main>
    </div>
  );
}
