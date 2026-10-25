import './env';
import { IntentParseError, parseIntent } from '../src/features/scheduling/intent';

try {
  const intent = await parseIntent('free for lunch tomorrow?', new Date().toISOString(), 'America/New_York');
  if (intent.needsClarification || intent.activity !== 'lunch' || !intent.localDate) throw new Error('unexpected interpretation');
  console.log('PASS: Gemini interpreted an invented lunch request. No calendar data was sent.');
} catch (error) {
  if (error instanceof IntentParseError && error.code === 'MODEL_BUSY') {
    console.error('RATE LIMITED: the Gemini key is configured but at its per-minute quota. Wait a minute and retry.');
    process.exit(1);
  }
  console.error('SETUP REQUIRED: configure GEMINI_API_KEY and an available structured-output GEMINI_MODEL, then retry. No live model check passed.');
  process.exitCode = 1;
}
