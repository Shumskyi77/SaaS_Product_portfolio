import { supabase } from '../src/lib/supabase';

// Supabase Storage for meal photos: bucket `mealPhotos`, path `{userId}/{mealId}.jpg`.
// Degrades as before: on any error — warn + null, photo stays local-only.
//
// TODO: bucket is currently private, so getPublicUrl() returns a URL that
// will only work once the project makes the bucket public (or we need to switch to
// signed URLs via createSignedUrl). Upload itself works independently.

const MEAL_PHOTOS_BUCKET = 'mealPhotos';

export const STORAGE_PHOTOS_ENABLED = true;

export function isDataUrlPhoto(u: unknown): u is string {
  return typeof u === 'string' && u.startsWith('data:image');
}

/** Convert a data URL (base64 or URL-encoded) to a Blob for upload. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || commaIdx === -1) return null;
    const meta = dataUrl.slice('data:'.length, commaIdx);
    const payload = dataUrl.slice(commaIdx + 1);
    if (!payload) return null;
    const isBase64 = meta.indexOf(';base64') !== -1;
    const mime = meta.split(';')[0] || 'image/jpeg';
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Upload a meal photo to Supabase Storage (`mealPhotos/{userId}/{mealId}.jpg`,
 * upsert) and return the public URL via getPublicUrl.
 * On error — warn + null (same degradation as before).
 */
export async function uploadMealPhoto(
  file: File | Blob,
  userId: string,
  mealId: string
): Promise<string | null> {
  try {
    if (!file || !userId || !mealId) return null;
    const path = `${userId}/${mealId}.jpg`;
    const { error } = await supabase.storage
      .from(MEAL_PHOTOS_BUCKET)
      .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
    if (error) {
      console.warn('[mealPhotos] upload failed, staying local-only:', error);
      return null;
    }
    const { data } = supabase.storage.from(MEAL_PHOTOS_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.warn('[mealPhotos] upload failed, staying local-only:', err);
    return null;
  }
}

/**
 * Migrate a data-URL photo to Storage: convert to Blob and upload.
 * Returns the public URL or null (nothing to migrate / error).
 */
export async function migrateDataUrlPhotosToStorage(
  dataUrl: string,
  userId: string,
  mealId: string
): Promise<string | null> {
  try {
    if (!isDataUrlPhoto(dataUrl)) return null;
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return null;
    return await uploadMealPhoto(blob, userId, mealId);
  } catch (err) {
    console.warn('[mealPhotos] migration failed, staying local-only:', err);
    return null;
  }
}
