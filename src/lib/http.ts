import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function appOrigin(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return new URL(configured).origin;
  // Unconfigured: trust the host the browser addressed; request.url can name a different loopback host.
  const host = request.headers.get('host');
  return host ? `${new URL(request.url).protocol}//${host}` : new URL(request.url).origin;
}

export function requireSameOrigin(request: Request): void {
  if (request.headers.get('origin') !== appOrigin(request)) {
    throw new HttpError(403, 'INVALID_ORIGIN', 'Please open Venn directly and try again.');
  }
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Send this request as JSON.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (declared > 8192) throw new HttpError(413, 'BODY_TOO_LARGE', 'Please use a shorter scheduling ask.');
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new HttpError(413, 'BODY_TOO_LARGE', 'Please use a shorter scheduling ask.');
      }
      chunks.push(next.value);
    }
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'INVALID_JSON', 'The request could not be read. Please try again.'); }
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(422, 'INVALID_INPUT', 'Check the request fields and try again.');
  return result.data;
}

export function apiError(error: unknown): Response {
  const safe = error instanceof HttpError
    ? error : new HttpError(500, 'REQUEST_FAILED', 'Something went wrong. Please try again.');
  return Response.json({ error: { code: safe.code, message: safe.message }, requestId: randomUUID() },
    { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
}

export const privateJson = (value: unknown, status = 200) => Response.json(value,
  { status, headers: { 'Cache-Control': 'private, no-store' } });
