import './env';
import { purgeExpired } from '../src/features/maintenance/purge';
import { getDb } from '../src/lib/db';

try { console.log(await purgeExpired()); }
catch { console.error('Cleanup could not run. Check the configured database and retry.'); process.exitCode = 1; }
finally { if (process.env.DATABASE_URL) await getDb().$disconnect().catch(() => undefined); }
