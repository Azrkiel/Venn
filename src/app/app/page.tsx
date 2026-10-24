import { DateTime } from 'luxon';
import { Planner } from '@/components/planner';

export const dynamic = 'force-dynamic';

export default function AppPage() {
  const initialDate = DateTime.now().setZone('America/New_York').plus({ days: 1 }).toISODate()!;
  return <Planner initialDate={initialDate} />;
}
