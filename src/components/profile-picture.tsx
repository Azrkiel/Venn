'use client';

import { useState } from 'react';
import { avatarOptions, type AvatarId, type PictureDraft } from '@/features/profile-pictures/schema';
import styles from './profile-picture-picker.module.css';

function GoofyFace({ id }: { id: AvatarId }) {
  const ink = '#292331';
  return <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
    {id === 'tongue' && <>
      <circle cx="48" cy="48" r="48" fill="#FFCFB7" />
      <path d="M13 29c5-14 19-21 35-21s30 7 35 21" stroke="#F6A780" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="33" cy="36" rx="7" ry="10" fill="white" /><ellipse cx="64" cy="35" rx="7" ry="10" fill="white" />
      <circle cx="35" cy="39" r="3.8" fill={ink} /><circle cx="62" cy="33" r="3.8" fill={ink} />
      <path d="M25 57c9 3 21 3 43-6-2 20-30 30-43 6Z" fill={ink} />
      <path d="M45 65c0-6 16-9 18-3l-1 15c-1 12-18 12-18 0l1-12Z" fill="#EC6F98" /><path d="m54 68-1 10" stroke="#C94A79" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="20" cy="51" rx="7" ry="4" fill="#F8A890" /><ellipse cx="77" cy="47" rx="7" ry="4" fill="#F8A890" />
    </>}
    {id === 'wink' && <>
      <circle cx="48" cy="48" r="48" fill="#CDBFFF" />
      <path d="m20 19 5 7m-9-2 8 2" stroke="#A18ADE" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="33" cy="38" rx="8" ry="11" fill="white" /><circle cx="35" cy="40" r="4" fill={ink} />
      <path d="m56 38 7-5 9 5" stroke={ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 59c10 14 25 16 37-4" stroke={ink} strokeWidth="4" strokeLinecap="round" /><path d="m69 17 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FFF8C7" />
      <ellipse cx="20" cy="55" rx="7" ry="4" fill="#B098ED" /><ellipse cx="77" cy="52" rx="7" ry="4" fill="#B098ED" />
    </>}
    {id === 'alien' && <>
      <circle cx="48" cy="48" r="48" fill="#D3EAC6" /><path d="M25 28c0-11 46-11 46 0v18c0 25-14 37-23 37S25 71 25 46V28Z" fill="#A7CA9C" />
      <ellipse cx="35" cy="43" rx="10" ry="15" transform="rotate(-24 35 43)" fill={ink} /><ellipse cx="62" cy="43" rx="10" ry="15" transform="rotate(24 62 43)" fill={ink} />
      <ellipse cx="33" cy="37" rx="2.5" ry="4" fill="white" /><ellipse cx="60" cy="37" rx="2.5" ry="4" fill="white" />
      <path d="M40 67c5 5 12 5 17-1" stroke={ink} strokeWidth="3" strokeLinecap="round" /><path d="m48 21 2-8" stroke={ink} strokeWidth="2.5" /><circle cx="51" cy="11" r="4" fill="#6043D2" />
      <path d="m12 62 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#FFF8C7" />
    </>}
    {id === 'frog' && <>
      <circle cx="48" cy="48" r="48" fill="#C8E8DA" /><ellipse cx="48" cy="56" rx="33" ry="27" fill="#75B99E" />
      <circle cx="29" cy="32" r="14" fill="#75B99E" /><circle cx="67" cy="32" r="14" fill="#75B99E" /><circle cx="29" cy="31" r="10" fill="#FFFDF0" /><circle cx="67" cy="31" r="10" fill="#FFFDF0" />
      <rect x="27" y="26" width="5" height="10" rx="2.5" fill={ink} /><rect x="65" y="26" width="5" height="10" rx="2.5" fill={ink} />
      <path d="M26 55c12 10 30 10 44-2" stroke={ink} strokeWidth="3.5" strokeLinecap="round" /><circle cx="41" cy="48" r="2" fill={ink} /><circle cx="54" cy="48" r="2" fill={ink} />
      <ellipse cx="25" cy="52" rx="6" ry="3" fill="#EBA9AA" /><ellipse cx="72" cy="51" rx="6" ry="3" fill="#EBA9AA" />
    </>}
    {id === 'chaos' && <>
      <circle cx="48" cy="48" r="48" fill="#FFE5A4" /><path d="m19 33 15-10m25 0 15 12" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <circle cx="31" cy="40" r="8" fill="white" /><circle cx="65" cy="40" r="8" fill="white" /><circle cx="34" cy="37" r="4" fill={ink} /><circle cx="62" cy="43" r="4" fill={ink} />
      <path d="M21 58c17-9 37-8 55 0-6 28-48 29-55 0Z" fill={ink} /><path d="m30 55 3 10 9-3 4 10 9-11 9 4 4-11" stroke="#FFFDF0" strokeWidth="5" strokeLinejoin="round" />
      <path d="m13 13 2 7m-7-2 7 2m65 45 7 1m-5-6 5 6" stroke="#E6B75C" strokeWidth="3" strokeLinecap="round" />
    </>}
    {id === 'sleepy' && <>
      <circle cx="48" cy="48" r="48" fill="#CBE0F1" /><path d="M24 44c6 4 12 4 17 0m14 0c6 4 12 4 17 0" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="49" cy="65" rx="8" ry="11" fill={ink} /><path d="M44 70h10" stroke="#EB8BA6" strokeWidth="5" strokeLinecap="round" />
      <path d="m21 27 16-3m23 0 14 4" stroke="#8DAEC5" strokeWidth="3" strokeLinecap="round" />
      <path d="m72 14 10 0-9 9h10m-3 7h7l-6 6h7" stroke="#6043D2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="20" cy="55" rx="7" ry="4" fill="#AACBDF" /><ellipse cx="77" cy="55" rx="7" ry="4" fill="#AACBDF" />
    </>}
  </svg>;
}

function Photo({ source, fallback }: { source: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  // The protected JPEG endpoint requires this browser's cookie; a server image optimizer cannot supply it.
  // eslint-disable-next-line @next/next/no-img-element
  return failed ? <span>{fallback}</span> : <img src={source} alt="" onError={() => setFailed(true)} />;
}

export function ProfilePicture({ share, picture, name, size = 64, decorative = false, className = '' }: {
  share: string; picture: PictureDraft; name?: string; size?: number; decorative?: boolean; className?: string;
}) {
  const initials = Array.from(name?.trim() ?? '').slice(0, 1).join('').toUpperCase() || '?';
  const label = picture?.kind === 'avatar' ? avatarOptions.find(option => option.id === picture.id)?.label : name ? `${name}'s profile picture` : 'Your profile picture';
  const source = picture?.kind === 'photo' ? 'dataUrl' in picture ? picture.dataUrl
    : `/api/venns/${encodeURIComponent(share)}/pictures/${encodeURIComponent(picture.key)}` : null;
  return <span className={`${styles.picture} ${className}`} style={{ width: size, height: size }}
    role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
    {picture?.kind === 'avatar' ? <GoofyFace id={picture.id} /> : source ? <Photo key={source} source={source} fallback={initials} /> : <span>{initials}</span>}
  </span>;
}
