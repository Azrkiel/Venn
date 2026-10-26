import sharp from 'sharp';
import { HttpError } from '@/lib/http';
import { createSecret } from '@/features/identity/secrets';
import { MAX_PHOTO_BYTES, pictureInputSchema, type PictureInput } from './schema';

const invalid = () => new HttpError(422, 'INVALID_PICTURE', 'Choose a valid small JPEG photo or one of the illustrated faces.');
export type StoredPicture = { avatarId: string | null; photo: Uint8Array<ArrayBuffer> | null; photoKey: string | null };

/** Decode and re-encode every photo; uploaded metadata and arbitrary bytes are never served back. */
export async function normalizePicture(input: PictureInput | undefined): Promise<StoredPicture | undefined> {
  if (input === undefined) return undefined;
  const parsed = pictureInputSchema.safeParse(input);
  if (!parsed.success) throw invalid();
  const picture = parsed.data;
  if (picture === null) return { avatarId: null, photo: null, photoKey: null };
  if (picture.kind === 'avatar') return { avatarId: picture.id, photo: null, photoKey: null };
  try {
    const encoded = picture.dataUrl.slice('data:image/jpeg;base64,'.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== encoded || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalid();
    const image = sharp(bytes, { limitInputPixels: 1_048_576, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || metadata.width > 1024 || metadata.height > 1024) throw invalid();
    let photo = await image.rotate().resize(192, 192, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
    if (photo.length > MAX_PHOTO_BYTES) photo = await sharp(photo).jpeg({ quality: 50 }).toBuffer();
    if (photo.length > MAX_PHOTO_BYTES) throw invalid();
    return { avatarId: null, photo: new Uint8Array(photo), photoKey: createSecret() };
  } catch { throw invalid(); }
}
