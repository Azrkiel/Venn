import './env';
import { parseIntent } from '../src/features/scheduling/intent';
for (let i = 0; i < 8; i++) {
  const t = Date.now();
  try { const r = await parseIntent('free for lunch tomorrow?', new Date().toISOString(), 'America/New_York'); console.log('ok', Date.now() - t, r.activity, r.localDate, r.durationMinutes, r.needsClarification); }
  catch (e) { console.log('ERR', Date.now() - t, (e as { code?: string }).code); }
}
