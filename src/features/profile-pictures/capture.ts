import { MAX_PHOTO_BYTES } from './schema';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PHOTO_SIZE = 192;

export function centerSquare(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The camera image is not ready.');
  }
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop());
}

/** Canvas re-encoding creates a small, metadata-free image that matches the circular preview. */
export function captureJpeg(source: CanvasImageSource, width: number, height: number, mirrored = false): string {
  const crop = centerSquare(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photos are unavailable in this browser. Pick a face instead.');
  if (mirrored) { context.translate(PHOTO_SIZE, 0); context.scale(-1, 1); }
  context.drawImage(source, crop.x, crop.y, crop.size, crop.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  for (const quality of [.85, .7, .5, .35]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1] ?? '';
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (dataUrl.startsWith('data:image/jpeg;base64,') && bytes > 0 && bytes <= MAX_PHOTO_BYTES) return dataUrl;
  }
  throw new Error('This photo could not be made small enough. Try another.');
}

export async function photoFromFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Choose a photo smaller than 8 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 16_777_216) throw new Error('IMAGE_TOO_LARGE');
    return captureJpeg(image, image.naturalWidth, image.naturalHeight);
  } catch { throw new Error('This photo could not be opened. Try another JPEG, PNG, or WebP.'); }
  finally { URL.revokeObjectURL(url); }
}
