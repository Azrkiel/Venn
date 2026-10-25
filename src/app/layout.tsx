import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/500.css';
import './globals.css';
import './interactions.css';
import { InteractionFeedback } from '@/components/interaction-feedback';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || 'http://localhost:3000'),
  title: 'Venn — Find a time, together',
  description: 'Find where your free time overlaps, and make a little room for each other.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<InteractionFeedback /></body></html>;
}
