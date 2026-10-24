import { after } from 'next/server';
import { handlePhotonWebhook } from '@/features/messaging/bot';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = (request: Request) => handlePhotonWebhook(request, work => after(work));
