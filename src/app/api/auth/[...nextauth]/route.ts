import { handlers, loginConfigured } from '@/auth';
import type { NextRequest } from 'next/server';

const setup = () => Response.json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Google sign-in needs server configuration.' } }, { status: 503 });
export const GET = (request: NextRequest) => loginConfigured() ? handlers.GET(request) : setup();
export const POST = (request: NextRequest) => loginConfigured() ? handlers.POST(request) : setup();
