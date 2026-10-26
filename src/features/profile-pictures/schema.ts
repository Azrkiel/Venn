import { z } from 'zod';

export const avatarOptions = [
  { id: 'tongue', label: 'Tongue out' }, { id: 'wink', label: 'Wink' },
  { id: 'alien', label: 'Space cadet' }, { id: 'frog', label: 'Frog mode' },
  { id: 'chaos', label: 'Chaos smile' }, { id: 'sleepy', label: 'Sleepy pal' },
] as const;
export const avatarIds = ['tongue', 'wink', 'alien', 'frog', 'chaos', 'sleepy'] as const;
export type AvatarId = typeof avatarIds[number];
export const MAX_PHOTO_BYTES = 32_768;
export const MAX_PHOTO_DATA_URL_LENGTH = 'data:image/jpeg;base64,'.length + 4 * Math.ceil(MAX_PHOTO_BYTES / 3);

const avatarSchema = z.object({ kind: z.literal('avatar'), id: z.enum(avatarIds) }).strict();
const photoInputSchema = z.object({ kind: z.literal('photo'),
  dataUrl: z.string().max(MAX_PHOTO_DATA_URL_LENGTH).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const photoViewSchema = z.object({ kind: z.literal('photo'), key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const pictureInputSchema = z.union([avatarSchema, photoInputSchema]).nullable();
export const pictureViewSchema = z.union([avatarSchema, photoViewSchema]);
export const pictureDraftSchema = z.union([avatarSchema, photoInputSchema, photoViewSchema]).nullable();
export type PictureInput = z.infer<typeof pictureInputSchema>;
export type PictureView = z.infer<typeof pictureViewSchema>;
export type PictureDraft = z.infer<typeof pictureDraftSchema>;

/** Existing photo references are display/draft state, never authority to copy another response's photo. */
export function pictureSubmission(picture: PictureDraft): PictureInput | undefined {
  return picture?.kind === 'photo' && 'key' in picture ? undefined : picture;
}
