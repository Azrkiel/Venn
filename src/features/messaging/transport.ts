import { createiMessageAdapter } from '@photon-ai/chat-adapter-imessage';
import type { Logger } from 'chat';
import { HttpError } from '@/lib/http';
import { isDirectThread } from '@/features/identity/phone-link';

// SDK log arguments may contain provider payloads. Venn deliberately passes no console logger.
const silentLogger: Logger = { child: () => silentLogger, debug() {}, info() {}, warn() {}, error() {} };

export function photonConfigured(): boolean {
  return Boolean(process.env.IMESSAGE_PROJECT_ID && process.env.IMESSAGE_PROJECT_SECRET
    && process.env.IMESSAGE_WEBHOOK_SECRET && process.env.DATABASE_URL);
}

export type OwnerTransport = (threadId: string, text: string) => Promise<void>;

/** Public adapter send API only; no Chat history, incoming-message cache, gateway or durable message queue. */
export const postVerifiedThread: OwnerTransport = async (threadId, text) => {
  if (!photonConfigured()) throw new HttpError(503, 'PHOTON_NOT_CONFIGURED', 'Connect Photon before using Venn in Messages.');
  if (!isDirectThread(threadId)) throw new HttpError(422, 'DIRECT_MESSAGE_REQUIRED', 'Venn sends private results only to your paired direct message.');
  const adapter = createiMessageAdapter({ local: false, projectId: process.env.IMESSAGE_PROJECT_ID,
    projectSecret: process.env.IMESSAGE_PROJECT_SECRET, webhookSecret: process.env.IMESSAGE_WEBHOOK_SECRET, logger: silentLogger });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      adapter.postMessage(threadId, { raw: text }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError(503, 'DELIVERY_UNCERTAIN',
        'Venn could not confirm delivery. Check Messages before sending again.')), 15_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
};
