import { describe, expect, it, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { HttpError, apiError, readJson, requireSameOrigin } from '@/lib/http';
import { createSecret, digestSecret, calendarEventId } from '@/features/identity/secrets';

afterEach(() => vi.unstubAllEnvs());
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
  it('returns safe generic errors rather than database/provider messages', async () => {
    const response = apiError(new Error('raw secret oauth payload'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
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
