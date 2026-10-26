import { afterEach, describe, expect, it, vi } from 'vitest';
import { centerSquare, captureJpeg, photoFromFile, stopCamera } from '@/features/profile-pictures/capture';

afterEach(() => { vi.unstubAllGlobals(); });

describe('profile photo capture', () => {
  it('crops the center of portrait and landscape sources without stretching', () => {
    expect(centerSquare(640, 480)).toEqual({ x: 80, y: 0, size: 480 });
    expect(centerSquare(480, 640)).toEqual({ x: 0, y: 80, size: 480 });
    for (const [width, height] of [[0, 480], [640, 0], [NaN, 480], [Infinity, 640]]) {
      expect(() => centerSquare(width, height)).toThrow('The camera image is not ready.');
    }
  });

  it('stops every video or audio track when a camera is closed', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopCamera({ getTracks: () => tracks } as unknown as MediaStream);
    tracks.forEach(track => expect(track.stop).toHaveBeenCalledOnce());
    expect(() => stopCamera(null)).not.toThrow();
  });

  it('mirrors only the capture that matches the selfie preview and re-encodes a bounded JPEG', () => {
    const context = { translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
    const dataUrl = `data:image/jpeg;base64,${btoa('synthetic jpeg')}`;
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => dataUrl) };
    vi.stubGlobal('document', { createElement: () => canvas });
    const source = {} as CanvasImageSource;
    expect(captureJpeg(source, 640, 480, true)).toBe(dataUrl);
    expect(context.translate).toHaveBeenCalledWith(192, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(source, 80, 0, 480, 480, 0, 0, 192, 192);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', expect.any(Number));
  });

  it('rejects oversized or unsupported files before touching browser decoding APIs', async () => {
    await expect(photoFromFile({ size: 8 * 1024 * 1024 + 1, type: 'image/jpeg' } as File)).rejects.toThrow('Choose a photo smaller than 8 MB.');
    await expect(photoFromFile({ size: 50, type: 'image/svg+xml' } as File)).rejects.toThrow('Choose a JPEG, PNG, or WebP photo.');
  });

  it('does not accept a canvas result bigger than the thumbnail bound', () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }),
      toDataURL: () => `data:image/jpeg;base64,${btoa('x'.repeat(40_000))}` };
    vi.stubGlobal('document', { createElement: () => canvas });
    expect(() => captureJpeg({} as CanvasImageSource, 192, 192)).toThrow('This photo could not be made small enough. Try another.');
  });
});
