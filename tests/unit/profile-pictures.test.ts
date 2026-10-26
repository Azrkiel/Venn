import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { avatarOptions, pictureInputSchema, pictureDraftSchema, pictureSubmission, MAX_PHOTO_BYTES } from '@/features/profile-pictures/schema';
import { normalizePicture } from '@/features/profile-pictures/normalize';

describe('profile-picture choices', () => {
  it('accepts the six fixed faces and rejects arbitrary IDs, URLs and identity fields', () => {
    expect(avatarOptions).toHaveLength(6);
    for (const option of avatarOptions) expect(pictureInputSchema.parse({ kind: 'avatar', id: option.id })).toEqual({ kind: 'avatar', id: option.id });
    for (const picture of [{ kind: 'avatar', id: 'anything' }, { kind: 'photo', url: 'https://outside.invalid/photo' },
      { kind: 'avatar', id: 'tongue', ownerId: 'other' }, { kind: 'photo', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }]) {
      expect(pictureInputSchema.safeParse(picture).success).toBe(false);
    }
    expect(pictureInputSchema.parse(null)).toBeNull();
  });
  it('keeps a stored photo reference only in drafts and omits it from writes', () => {
    const reference = { kind: 'photo' as const, key: 'k'.repeat(43) };
    expect(pictureDraftSchema.parse(reference)).toEqual(reference);
    expect(pictureSubmission(reference)).toBeUndefined();
    expect(pictureInputSchema.safeParse(reference).success).toBe(false);
    expect(pictureSubmission(null)).toBeNull();
    expect(pictureSubmission({ kind: 'avatar', id: 'frog' })).toEqual({ kind: 'avatar', id: 'frog' });
    expect(pictureDraftSchema.safeParse({ ...reference, key: '../outside' }).success).toBe(false);
  });
});

describe('server thumbnail normalization', () => {
  it('preserves omitted input, clears removal, and stores only a selected avatar ID', async () => {
    expect(await normalizePicture(undefined)).toBeUndefined();
    expect(await normalizePicture(null)).toEqual({ avatarId: null, photo: null, photoKey: null });
    expect(await normalizePicture({ kind: 'avatar', id: 'tongue' })).toEqual({ avatarId: 'tongue', photo: null, photoKey: null });
  });
  it('verifies JPEG bytes, crops to 192 square and removes embedded metadata', async () => {
    const input = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#aa55cc' } })
      .withExif({ IFD0: { Artist: 'private-camera-canary' } }).jpeg().toBuffer();
    const result = await normalizePicture({ kind: 'photo', dataUrl: `data:image/jpeg;base64,${input.toString('base64')}` });
    expect(result?.avatarId).toBeNull();
    expect(result?.photoKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result?.photo).toBeInstanceOf(Uint8Array);
    expect(result!.photo!.byteLength).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    const metadata = await sharp(result!.photo!).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 192, height: 192 });
    expect(metadata.exif).toBeUndefined();
    expect(Buffer.from(result!.photo!).toString()).not.toContain('private-camera-canary');
  });
  it('rejects oversized, corrupt, wrong-format and excessive-dimension input with a safe error', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const wide = await sharp({ create: { width: 1025, height: 1, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const values = [Buffer.alloc(MAX_PHOTO_BYTES + 1), Buffer.from('not-an-image'), png, wide];
    for (const bytes of values) await expect(normalizePicture({ kind: 'photo', dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }))
      .rejects.toMatchObject({ status: 422, code: 'INVALID_PICTURE' });
  });
});
