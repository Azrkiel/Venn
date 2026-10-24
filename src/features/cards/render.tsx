import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import type { getOwnerRequest } from '@/features/requests/service';
import type { Busy } from '@/features/scheduling/types';

type OwnerView = Awaited<ReturnType<typeof getOwnerRequest>>;
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400; style: 'normal' }[]> | undefined;
function loadFonts() {
  fonts ??= Promise.all(['Inter', 'Fraunces'].map(async name => {
    const data = await readFile(join(process.cwd(), 'public', 'fonts', `${name}.woff`));
    return { name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, weight: 400 as const, style: 'normal' as const };
  }));
  return fonts;
}

export async function renderOwnerCard(view: OwnerView, busy: Busy[] | null = null) {
  const day = DateTime.fromISO(view.localDate, { zone: view.timezone });
  const start = day.set({ hour: 9 }).toMillis(), end = day.set({ hour: 21 }).toMillis();
  const position = (time: number) => Math.max(0, Math.min(100, (time - start) / (end - start) * 100));
  const personName = (id: string) => view.participants.find(person => person.id === id)?.displayName ?? 'a friend';
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    background: '#FBF9F6', color: '#1D1B24', padding: '70px', fontFamily: 'Inter', fontSize: 30 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#6043D2', marginBottom: 42 }}>
      <div style={{ display: 'flex', width: 65, height: 48, position: 'relative' }}>
        <div style={{ position: 'absolute', width: 46, height: 46, border: '2px solid #1D1B24', borderRadius: 99, left: 0 }} />
        <div style={{ position: 'absolute', width: 46, height: 46, border: '2px solid #1D1B24', borderRadius: 99, left: 22, background: '#C9BCFF' }} />
      </div><span style={{ fontFamily: 'Fraunces', fontSize: 50 }}>venn</span><span style={{ marginLeft: 'auto', fontSize: 25 }}>just for you</span>
    </div>
    <div style={{ display: 'flex', fontSize: 28, color: '#79757F', textTransform: 'uppercase', letterSpacing: 2 }}>{day.toFormat('cccc, LLLL d')}</div>
    <div style={{ display: 'flex', fontFamily: 'Fraunces', fontSize: 72, lineHeight: 1.1, marginTop: 18 }}>A little room for {view.activity}.</div>
    <div style={{ display: 'flex', color: '#79757F', marginTop: 22 }}>{view.groupName} · {view.durationMinutes} min · 15 min to breathe</div>
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 46, padding: 28, border: '2px solid #E4E1DB', borderRadius: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 25, marginBottom: 20 }}><span>Your day</span><span>{day.toFormat('ZZZZ')}</span></div>
      <div style={{ display: 'flex', position: 'relative', height: 115, background: '#F1EEE8', borderRadius: 12, overflow: 'hidden' }}>
        {(busy ?? []).map((block, i) => <div key={i} style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0,
          left: `${position(block.start)}%`, width: `${Math.max(0, position(block.end) - position(block.start))}%`, background: '#E4E1DB' }} />)}
        {view.slots.map(slot => <div key={slot.id} style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0,
          left: `${position(slot.start)}%`, width: `${Math.max(0, position(slot.end) - position(slot.start))}%`, background: '#C9BCFF' }} />)}
        {busy === null && <span style={{ display: 'flex', margin: 'auto', fontSize: 24, color: '#79757F' }}>Timeline unavailable · options below</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23, color: '#79757F', marginTop: 15 }}><span>9 am</span><span>3 pm</span><span>9 pm</span></div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 36 }}>
      {view.slots.map(slot => <div key={slot.id} style={{ display: 'flex', flexDirection: 'column', padding: '26px 30px',
        borderRadius: 25, background: slot.freeIds.length === view.participants.length ? '#7B5CFF' : '#EEE8FC',
        color: slot.freeIds.length === view.participants.length ? 'white' : '#493268' }}>
        <div style={{ display: 'flex', fontSize: 43 }}>{slot.ordinal} · {DateTime.fromMillis(slot.start, { zone: view.timezone }).toFormat('h:mm')}–{DateTime.fromMillis(slot.end, { zone: view.timezone }).toFormat('h:mm a').toLowerCase()}</div>
        <div style={{ display: 'flex', fontSize: 26, marginTop: 12 }}>{slot.freeIds.length === view.participants.length
          ? 'everyone is free' : `${slot.freeIds.length} of ${view.participants.length} free${slot.busyIds.length ? ` · not ${slot.busyIds.map(personName).join(', ')}` : ''}${slot.unknownIds.length ? ` · ${slot.unknownIds.length} unknown` : ''}`}</div>
      </div>)}
    </div>
    <div style={{ display: 'flex', fontSize: 25, color: '#79757F', marginTop: 'auto', paddingTop: 30 }}>Reply 1, 2 or 3, or open Lemme check. You choose what to send.</div>
  </div>, { width: 1080, height: 1350, fonts: await loadFonts(), headers: { 'Cache-Control': 'private, no-store' } });
}
