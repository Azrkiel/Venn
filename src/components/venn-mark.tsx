import { useId } from 'react';

export function VennMark({ size = 45 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 50 36" fill="none" aria-hidden="true">
      <defs><clipPath id={id}><circle cx="18" cy="18" r="14" /></clipPath></defs>
      <circle cx="32" cy="18" r="14" fill="#7B5CFF" clipPath={`url(#${id})`} />
      <circle cx="18" cy="18" r="14" stroke="#1D1B24" strokeWidth="1.6" />
      <circle cx="32" cy="18" r="14" stroke="#1D1B24" strokeWidth="1.6" />
    </svg>
  );
}
