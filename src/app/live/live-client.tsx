'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import type { listGroups } from '@/features/groups/service';
import type { getOwnerRequest } from '@/features/requests/service';
import styles from './live.module.css';

type Group = Awaited<ReturnType<typeof listGroups>>[number];
type OwnerRequest = Awaited<ReturnType<typeof getOwnerRequest>>;
type ApiFailure = { error?: { code?: string; message?: string } };
class ActionError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function action<T>(path: string, method = 'POST', value?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: 'same-origin',
    ...(value === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(35_000) });
  const result = await response.json().catch(() => null) as T & ApiFailure;
  if (!response.ok || !result) throw new ActionError(result?.error?.code ?? 'REQUEST_FAILED', result?.error?.message ?? 'That did not go through. Please try again.');
  return result;
}

function slotTime(start: number, end: number, zone: string) {
  return `${DateTime.fromMillis(start, { zone }).toFormat('h:mm a').toLowerCase()}–${DateTime.fromMillis(end, { zone }).toFormat('h:mm a').toLowerCase()}`;
}

export function LiveClient({ initialGroups, initialRequest, timezone: initialZone, modelReady, initialError, calendarResult }: {
  initialGroups: Group[]; initialRequest: OwnerRequest | null; timezone: string; modelReady: boolean; initialError: string; calendarResult: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [groupId, setGroupId] = useState(initialRequest?.groupId ?? initialGroups.find(group => group.isOwner)?.id ?? '');
  const group = groups.find(item => item.id === groupId);
  const [requesterId, setRequesterId] = useState('');
  const requester = group?.members.find(member => member.id === requesterId)
    ?? group?.members.find(member => !member.isYou) ?? group?.members.find(member => member.isYou);
  const [timezone, setTimezone] = useState(initialZone);
  const [ask, setAsk] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [request, setRequest] = useState(initialRequest);
  const [draft, setDraft] = useState(initialRequest?.draft ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState(calendarResult === 'write-granted'
    ? 'Permission granted. Review your selected option, then press Add to my calendar when you are ready. No event has been created.'
    : calendarResult === 'write-declined' ? 'Calendar write permission was declined. You can still copy and send your reply.' : '');
  const [writeConsent, setWriteConsent] = useState(false);
  const [invitePath, setInvitePath] = useState('');
  const [sharePath, setSharePath] = useState('');
  const selected = request?.slots.find(slot => slot.id === request.selectedSlotId);
  const activeRequest = request && ['ready', 'selected'].includes(request.state);

  async function perform(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); }
    catch (failure) {
      if (failure instanceof ActionError && failure.code === 'CALENDAR_WRITE_CONSENT_REQUIRED') setWriteConsent(true);
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'The response took too long. Check the result before trying a write again.');
    } finally { setBusy(false); }
  }

  function acceptResult(result: OwnerRequest) {
    setRequest(result); setDraft(result.draft); setSharePath(''); setWriteConsent(false);
    window.history.replaceState(null, '', `/live?request=${encodeURIComponent(result.id)}`);
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice(label); }
    catch { setNotice('Copy is unavailable in this browser. Select the reply text to copy it, or open the share link below.'); }
  }

  async function createGroup() {
    await perform(async () => {
      const created = await action<{ id: string }>('/api/groups', 'POST', { name: newGroup });
      const next = await action<{ groups: Group[] }>('/api/groups', 'GET');
      setGroups(next.groups); setGroupId(created.id); setNewGroup(''); setRequest(null);
      setNotice('Group created. You can invite friends through Group details below.');
    });
  }

  async function findOptions(event: React.FormEvent) {
    event.preventDefault();
    if (!group || !requester) { setError('Choose a group and the person asking first.'); return; }
    await perform(async () => {
      const result = await action<OwnerRequest | { state: 'needs_clarification'; intent: { clarificationReason: string | null } }>('/api/requests', 'POST', {
        groupId: group.id, requesterMemberId: requester.id, text: ask, timezone,
      });
      if (result.state === 'needs_clarification') {
        setNotice('Please make the activity, date, and approximate duration clearer, then check again.');
        return;
      }
      acceptResult(result as OwnerRequest);
    });
  }

  async function choose(slotId: string) {
    if (!request) return;
    await perform(async () => acceptResult(await action<OwnerRequest>(`/api/requests/${encodeURIComponent(request.id)}/select`, 'POST', { slotId, slotVersion: request.slotVersion })));
  }

  const step = selected ? 3 : request ? 2 : 1;
  return <>
    <div className={styles.steps} aria-label={`Step ${step} of 3`}>
      {['Your plan', 'Good windows', 'Your reply'].map((label, index) => <span key={label} style={{ display: 'contents' }}>
        {index > 0 && <span className={styles.line} aria-hidden="true" />}
        <span className={`${styles.step} ${index + 1 === step ? styles.activeStep : ''}`}><span className={styles.stepNumber}>{index + 1}</span>{label}</span>
      </span>)}
    </div>
    {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
    {notice && <p className={styles.status} role="status">{notice}</p>}
    {!modelReady && <p className={styles.status}>Gemini needs to be configured before Venn can interpret live requests. <Link className={styles.link} href="/setup">See connection setup</Link>.</p>}

    {!request && <>
      {groups.some(item => item.isOwner) ? <form className={styles.form} onSubmit={findOptions}>
        <label className={styles.field}>Who&apos;s making plans?
          <select className={styles.select} value={groupId} onChange={event => { setGroupId(event.target.value); setRequesterId(''); setInvitePath(''); }}>
            {groups.filter(item => item.isOwner).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>What&apos;s the plan?
          <textarea className={styles.textarea} value={ask} onChange={event => setAsk(event.target.value)} maxLength={2000} required
            placeholder="e.g. free for lunch tomorrow? about an hour" />
          <span className={styles.hint}>Only this scheduling ask is sent for interpretation. Calendar checks use busy/free time.</span>
        </label>
        <details className={styles.details}>
          <summary>{requester ? `${requester.isYou ? 'You' : requester.displayName} asked · ${timezone.replaceAll('_', ' ')}` : 'Requester and timezone'}</summary>
          <div className={styles.detailsBody}>
            <label className={styles.field}>Who is asking?
              <select className={styles.select} value={requester?.id ?? ''} onChange={event => setRequesterId(event.target.value)}>
                {group?.members.map(member => <option key={member.id} value={member.id}>{member.isYou ? 'You' : member.displayName}{member.connected ? '' : ' · Calendar not connected'}</option>)}
              </select>
            </label>
            <label className={styles.field}>Your timezone<input className={styles.input} value={timezone} onChange={event => setTimezone(event.target.value)} required maxLength={100} /></label>
            <p className={styles.hint}>You and the requester must both have known availability. Unconnected friends remain unknown.</p>
          </div>
        </details>
        <button className={styles.button} disabled={busy || !modelReady || !ask.trim()}>{busy ? 'Checking calendars…' : 'Find a time together →'}</button>
      </form> : <section className={styles.card}>
        <h2>Start with a small group</h2>
        <p className={styles.intro}>Give your lunch crew or friends a place to find shared time. You can invite them after creating it.</p>
        {groups.length > 0 && <p className={styles.subtle}>You have joined {groups.map(item => item.name).join(', ')}. Their organizers create requests; you can create your own group below.</p>}
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void createGroup(); }}>
          <label className={styles.field}>Group name<input className={styles.input} value={newGroup} onChange={event => setNewGroup(event.target.value)} placeholder="Lunch crew" maxLength={60} required /></label>
          <button className={styles.button} disabled={busy || !newGroup.trim()}>{busy ? 'Creating…' : 'Create group'}</button>
        </form>
      </section>}
      {group?.isOwner && <details className={styles.details} style={{ marginTop: 24 }}>
        <summary>Group details &amp; invitations</summary>
        <div className={styles.detailsBody}>
          <div className={styles.members}>{group.members.map(member => <span className={styles.member} key={member.id}>{member.isYou ? 'You' : member.displayName} · {member.connected ? 'Connected' : 'Unknown'}</span>)}
            {group.unknownPeople.map(member => <span className={styles.member} key={member.id}>{member.displayName} · Unknown</span>)}</div>
          <p className={styles.hint}>A connection means permission has been granted. Venn still checks every selected calendar for each request.</p>
          <div className={styles.buttonRow}><button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy} onClick={() => void perform(async () => {
            const invite = await action<{ path: string }>(`/api/groups/${encodeURIComponent(group.id)}`, 'POST', { action: 'invite' });
            setInvitePath(invite.path); await copy(new URL(invite.path, window.location.origin).href, 'Invite link copied. Share it with your friends yourself.');
          })}>Invite friends</button>{invitePath && <Link className={styles.link} href={invitePath}>Open invite</Link>}</div>
          <details><summary>Create another group</summary><form className={styles.form} onSubmit={event => { event.preventDefault(); void createGroup(); }}>
            <label className={styles.field}>Group name<input className={styles.input} value={newGroup} onChange={event => setNewGroup(event.target.value)} maxLength={60} required /></label>
            <button className={`${styles.button} ${styles.secondary}`} disabled={busy || !newGroup.trim()}>Create group</button>
          </form></details>
        </div>
      </details>}
    </>}

    {request && <section aria-label="Calendar result">
      <h2 className={styles.sectionHeading}>{selected ? 'A good time, together.' : request.slots.length ? 'A few good windows.' : 'Let’s try another window.'}</h2>
      <p className={styles.resultMeta}>{request.groupName} · {request.activity} · {DateTime.fromISO(request.localDate).toFormat('ccc, LLL d')} · {request.durationMinutes} min<br />
        {request.timezone.replaceAll('_', ' ')} · checked {DateTime.fromISO(request.checkedAt).setZone(request.timezone).toFormat('h:mm a').toLowerCase()}</p>
      {request.state === 'retry_required' && <p className={styles.status}>A required calendar is unknown, or these options need a fresh check. <Link className={styles.link} href="/setup">Check your connections</Link>.</p>}
      {request.state === 'no_slots' && <p className={styles.intro}>No shared window fits this request with breathing room. Try a different day or a shorter activity.</p>}
      {request.state === 'cancelled' && <p className={styles.status}>This request is cancelled. Its shared links are no longer active.</p>}
      {activeRequest && <div className={styles.results} style={{ marginTop: 20 }}>
        {request.slots.filter(slot => !selected || slot.id === selected.id).map(slot => <button key={slot.id} type="button" disabled={busy} onClick={() => void choose(slot.id)}
          className={`${styles.option} ${slot.id === request.selectedSlotId ? styles.optionSelected : ''}`} aria-pressed={slot.id === request.selectedSlotId}>
          <span className={styles.optionNumber}>{slot.ordinal}</span><span className={styles.optionText}><strong className={styles.optionTime}>{slotTime(slot.start, slot.end, request.timezone)}</strong>
            <span className={styles.optionAttendance}>{slot.freeIds.length === request.participants.length ? 'Everyone is free' : `${slot.freeIds.length} of ${request.participants.length} known free`}
              {slot.unknownIds.length > 0 ? ` · ${slot.unknownIds.length} unknown` : ''}
              {slot.busyIds.length > 0 ? ` · busy: ${request.participants.filter(member => slot.busyIds.includes(member.id)).map(member => member.displayName).join(', ')}` : ''}</span></span>
          {slot.id === request.selectedSlotId && <span className={styles.selectedMark} aria-label="Selected">✓</span>}
        </button>)}
      </div>}
      {selected && activeRequest && <section className={styles.card}>
        <h2>Your words, your send.</h2><label className={styles.field} htmlFor="live-draft">Edit your reply</label>
        <textarea id="live-draft" className={styles.draft} value={draft} onChange={event => setDraft(event.target.value)} />
        <div className={styles.buttonRow}><button type="button" className={styles.button} onClick={() => void copy(draft, 'Reply copied. Open your conversation and send it when you’re ready.')}>Copy reply</button>
          <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => { setRequest({ ...request, selectedSlotId: null }); setWriteConsent(false); }}>See other options</button></div>
        <p className={styles.subtle}>Venn does not send this reply to your friends.</p>
        <details className={styles.details} style={{ marginTop: 20 }}><summary>Share options or save to your calendar</summary><div className={styles.detailsBody}>
          <p className={styles.hint}>Sharing creates an option-only link for friends to answer. Add saves only to your own calendar after a fresh conflict check.</p>
          <div className={styles.buttonRow}><button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void perform(async () => {
            const share = await action<{ path: string }>(`/api/requests/${encodeURIComponent(request.id)}/share`);
            setSharePath(share.path); await copy(new URL(share.path, window.location.origin).href, 'Options link copied. Share it yourself in your conversation.');
          })}>Share options</button>
            <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy || writeConsent} onClick={() => void perform(async () => {
              acceptResult(await action<OwnerRequest>(`/api/requests/${encodeURIComponent(request.id)}/add`, 'POST', { slotId: selected.id, slotVersion: request.slotVersion }));
              setNotice('Added to your calendar. No friends were invited or messaged.');
            })}>{busy ? 'Working…' : 'Add to my calendar'}</button></div>
          {sharePath && <Link className={styles.link} href={sharePath}>Open shared options</Link>}
          {writeConsent && <form action="/api/calendar/connect" method="post"><input type="hidden" name="purpose" value="write" /><input type="hidden" name="requestId" value={request.id} />
            <p className={styles.hint} style={{ marginBottom: 12 }}>Google needs separate permission to create events. After consent, you will return here to confirm Add. Nothing is booked automatically.</p>
            <button className={styles.button}>Allow calendar writes</button></form>}
        </div></details>
      </section>}
      {request.event && <div className={styles.card}><h2>It&apos;s on your calendar.</h2><p className={styles.intro}>Your selected event was added once. No friends were invited or messaged.</p>
        {request.event.htmlLink && <a className={styles.link} href={request.event.htmlLink} target="_blank" rel="noreferrer">Open Google Calendar</a>}</div>}
      <div className={styles.buttonRow}>
        <button type="button" className={`${styles.button} ${styles.quiet}`} disabled={busy} onClick={() => { setRequest(null); setDraft(''); setSharePath(''); setWriteConsent(false); setNotice(''); window.history.replaceState(null, '', '/live'); }}>Check another plan</button>
        {activeRequest && <button type="button" className={`${styles.button} ${styles.quiet}`} disabled={busy} onClick={() => void perform(async () => {
          await action(`/api/requests/${encodeURIComponent(request.id)}`, 'PATCH', { action: 'cancel' }); setRequest({ ...request, state: 'cancelled', selectedSlotId: null });
        })}>Cancel this request</button>}
      </div>
    </section>}
  </>;
}
