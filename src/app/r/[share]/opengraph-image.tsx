import { ImageResponse } from 'next/og';
import { loadSharedPoll } from '@/features/polls/shared';
import { formatSlot } from '@/features/scheduling/draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Venn — drag to show when you are free';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function SharedOptionsImage({ params }: { params: Promise<{ share: string }> }) {
  let shared;
  try { shared = await loadSharedPoll((await params).share); }
  catch { /* An invalid or expired link produces only a generic card, never an old snapshot. */ }
  const poll = shared?.kind === 'options' ? shared.poll : null;
  const availability = shared?.kind === 'availability' ? shared.poll : null;
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
    padding: '46px 62px', background: '#FBF9F6', color: '#1D1B24', fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 25 }}>
      <div style={{ display: 'flex', width: 40, height: 40, border: '2px solid #7B5CFF', borderRadius: '50%' }} />
      <div style={{ display: 'flex', width: 40, height: 40, border: '2px solid #7B5CFF', borderRadius: '50%', marginLeft: -32 }} />
      <div style={{ display: 'flex', fontSize: 36, fontWeight: 600 }}>venn</div>
    </div>
    <div style={{ display: 'flex', fontSize: 47, marginBottom: 12 }}>{availability ? availability.closed ? 'The group’s overlap is in.' : 'Drag to show when you’re free.' : poll ? 'A few good times, together.' : 'Open Venn for the latest plan.'}</div>
    <div style={{ display: 'flex', color: '#79757F', fontSize: 21, marginBottom: 24 }}>{availability ? `${availability.activity} · ${availability.startDate}${availability.endDate !== availability.startDate ? ` – ${availability.endDate}` : ''}` : poll ? `${poll.activity} · ${poll.localDate} · ${poll.timezone}` : 'This shared plan may have changed or expired.'}</div>
    {availability && <div style={{ display: 'flex', flexDirection: 'column', padding: '26px 30px', background: '#F2EEFC', borderRadius: 20, gap: 20 }}>
      <div style={{ display: 'flex', fontSize: 30, color: '#6043D2' }}>Your people. One link. A good overlap.</div>
      <div style={{ display: 'flex', gap: 8, height: 62 }}>{[0.15, 0.25, 0.5, 0.85, 1, 1, 0.75, 0.35, 0.15].map((opacity, i) => <div key={i} style={{ display: 'flex', flex: 1, borderRadius: 8, background: '#7B5CFF', opacity }} />)}</div>
      <div style={{ display: 'flex', fontSize: 22, color: '#79757F' }}>{availability.respondentCount} {availability.respondentCount === 1 ? 'person has' : 'people have'} answered · no account needed to join</div>
    </div>}
    {poll?.options.slice(0, 3).map(option => <div key={option.id} style={{ display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', background: '#F2EEFC', borderRadius: 20, marginBottom: 12, padding: '15px 24px', fontSize: 27 }}>
      <div style={{ display: 'flex' }}>{option.ordinal} · {formatSlot(Date.parse(option.start), Date.parse(option.end), poll.timezone)}</div>
      <div style={{ display: 'flex', fontSize: 21, color: '#6043D2' }}>{option.freeCount}/{option.totalCount} free{option.unknownCount ? ` · ${option.unknownCount} unknown` : ''}</div>
    </div>)}
    <div style={{ display: 'flex', marginTop: 'auto', color: '#79757F', fontSize: 20 }}>{availability ? 'Open the link · choose your dates or times · find your overlap' : 'Tap to respond · options only, no private calendar timeline'}</div>
  </div>, { ...size, headers: { 'Cache-Control': 'private, no-store' } });
}
