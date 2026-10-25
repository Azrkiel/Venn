import { describe, expect, it, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { HttpError, apiError, readJson, requireSameOrigin } from '@/lib/http';
import { createSecret, digestSecret, calendarEventId } from '@/features/identity/secrets';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('request boundaries', () => {
  it('rejects cross-origin writes and accepts the configured origin', () => {
    vi.stubEnv('APP_BASE_URL', 'https://venn.example');
    expect(() => requireSameOrigin(new Request('https://venn.example/api/x', { headers: { origin: 'https://evil.example' } }))).toThrow(HttpError);
    expect(() => requireSameOrigin(new Request('https://venn.example/api/x', { headers: { origin: 'https://venn.example' } }))).not.toThrow();
  });
  it('uses the addressed host when no origin is configured', () => {
    vi.stubEnv('APP_BASE_URL', '');
    const at = (origin: string) => new Request('http://localhost:3000/api/x', { headers: { host: '127.0.0.1:3000', origin } });
    expect(() => requireSameOrigin(at('http://127.0.0.1:3000'))).not.toThrow();
    expect(() => requireSameOrigin(at('http://evil.example'))).toThrow(HttpError);
  });
  it('does not accept a missing browser origin for session writes', () => {
    expect(() => requireSameOrigin(new Request('http://localhost/api/x'))).toThrow(HttpError);
  });
  it('validates JSON without leaking arbitrary input in errors', async () => {
    const request = new Request('https://venn.example', { method: 'POST', body: JSON.stringify({ count: 'secret-text' }), headers: { 'content-type': 'application/json' } });
    await expect(readJson(request, z.object({ count: z.number() }))).rejects.toMatchObject({ status: 422, code: 'INVALID_INPUT' });
  });
  it('enforces actual body bytes regardless of declared length', async () => {
    const request = new Request('https://venn.example', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(9000) }), headers: { 'content-type': 'application/json' } });
    await expect(readJson(request, z.object({ text: z.string() }))).rejects.toMatchObject({ status: 413 });
  });
  it('permits explicitly larger bounded availability payloads while retaining the default limit', async () => {
    const make = (size: number) => new Request('https://venn.example', { method: 'PUT',
      body: JSON.stringify({ text: 'x'.repeat(size) }), headers: { 'content-type': 'application/json' } });
    await expect(readJson(make(9000), z.object({ text: z.string() }), 65_536)).resolves.toMatchObject({ text: expect.any(String) });
    await expect(readJson(make(66_000), z.object({ text: z.string() }), 65_536)).rejects.toMatchObject({ status: 413 });
  });
  it('returns safe generic errors rather than database/provider messages', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiError(new Error('raw secret oauth payload'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
  });
  it('correlates unexpected failures with a request ID without logging raw provider data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = Object.assign(new Error('private-canary body token@example.invalid'), {
      code: 'P2002', meta: { target: 'private-canary' },
    });
    const response = apiError(failure);
    const body = await response.json();
    expect(log).toHaveBeenCalledExactlyOnceWith('[venn] request_failed', { requestId: body.requestId, code: 'P2002' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-canary|token@example|meta|stack|message/);
    expect(JSON.stringify(body)).not.toMatch(/private-canary|token@example|P2002/);
  });
  it('does not log expected HTTP errors and does not trust arbitrary error codes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const expected = apiError(new HttpError(429, 'RATE_LIMITED', 'Try again shortly.'));
    expect(expected.status).toBe(429);
    expect(log).not.toHaveBeenCalled();
    const response = apiError({ code: 'private-canary', message: 'private-canary' });
    const body = await response.json();
    expect(log).toHaveBeenCalledExactlyOnceWith('[venn] request_failed', { requestId: body.requestId, code: 'UNEXPECTED' });
  });
});
describe('scoped secrets and calendar identities', () => {
  it('generates high-entropy independent link secrets and stores digests', () => {
    const a = createSecret(), b = createSecret();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(digestSecret(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestSecret(a)).not.toContain(a);
  });
  it('uses a stable provider-compatible event ID per owner/request', () => {
    expect(calendarEventId('owner', 'request')).toBe(calendarEventId('owner', 'request'));
    expect(calendarEventId('other', 'request')).not.toBe(calendarEventId('owner', 'request'));
    expect(calendarEventId('owner', 'request')).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});
