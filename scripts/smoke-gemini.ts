import './env';
import { parseIntent } from '../src/features/scheduling/intent';

try {
  const intent = await parseIntent('free for lunch tomorrow?', new Date().toISOString(), 'America/New_York');
  if (intent.needsClarification || intent.activity !== 'lunch' || !intent.localDate) throw new Error('unexpected interpretation');
  console.log('PASS: Gemini interpreted an invented lunch request. No calendar data was sent.');
} catch {
  console.error('SETUP REQUIRED: configure GEMINI_API_KEY and an available structured-output GEMINI_MODEL, then retry. No live model check passed.');
  process.exitCode = 1;
}
