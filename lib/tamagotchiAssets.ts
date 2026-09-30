import { TamagotchiBreed, TamagotchiMood } from '../types/tamagotchi';
import { TAMAGOTCHI_BASE64_ASSETS } from './tamagotchiBase64';

// In-memory cache: artwork ships in the bundle (tamagotchiBase64),
// there is no remote collection to enrich it from.
const dynamicAssetCache: Record<string, Record<string, string>> = {
  ...TAMAGOTCHI_BASE64_ASSETS,
};

/**
 * Returns the exact Base64 data URL for a Tamagotchi breed and mood.
 * 100% self-contained, instant 0ms render with no network requests or 404s.
 */
export function getTamagotchiImage(breed: TamagotchiBreed, mood: TamagotchiMood = 'happy'): string {
  const breedImages = dynamicAssetCache[breed] || TAMAGOTCHI_BASE64_ASSETS[breed] || TAMAGOTCHI_BASE64_ASSETS.shiba;
  return breedImages[mood] || breedImages.happy || TAMAGOTCHI_BASE64_ASSETS.shiba.happy;
}

/**
 * No-op, kept for backwards compatibility: pet artwork already lives in the
 * bundle (tamagotchiBase64), so there is nothing remote to load or enrich
 * the cache with. Resolves immediately.
 */
export async function loadTamagotchiAssetsFromFirestore(): Promise<void> {
  return;
}
