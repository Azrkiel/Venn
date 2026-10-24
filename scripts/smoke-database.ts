import './env';
import { getDb } from '../src/lib/db';

try {
  await getDb().$queryRaw`SELECT 1`;
  console.log('PASS: Postgres connection is available.');
} catch {
  console.error('SETUP REQUIRED: configure DATABASE_URL and apply the migrations. No live database check passed.');
  process.exitCode = 1;
} finally {
  if (process.env.DATABASE_URL) await getDb().$disconnect().catch(() => undefined);
}
