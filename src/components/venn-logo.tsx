import Image from 'next/image';

export function VennLogo({ size = 40 }: { size?: number }) {
  return <Image src="/venn-logo.svg" alt="venn" width={Math.round(size * 4.4)} height={size} className="venn-logo" />;
}
