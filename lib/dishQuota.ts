/**
 * lib/dishQuota.ts — dish limit for the open demo version.
 *
 * Rule: only DISH_LIMIT dishes can be added — by ANY method
 * (photo scanner, voice recorder, AI text, product database, barcode).
 * After that — AiLimitPopup.
 *
 * Editing/deleting your own dishes — unlimited.
 * Counter is stored in localStorage (per-browser). This is a demo gate, not
 * billing: a strict server-side limit can be added separately if needed.
 */

export const DISH_LIMIT = 1;

const DISH_QUOTA_KEY = 'foodvisor_dishes_used';

function readUsed(): number {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    const raw = window.localStorage.getItem(DISH_QUOTA_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeUsed(n: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(DISH_QUOTA_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    // private mode / disabled storage — just don't persist
  }
}

/** How many dishes have already been added. */
export function getDishesUsed(): number {
  return readUsed();
}

/** How many dishes can still be added. */
export function getDishesLeft(): number {
  return Math.max(0, DISH_LIMIT - readUsed());
}

/** Whether more dishes can still be added. */
export function hasDishQuota(): boolean {
  return readUsed() < DISH_LIMIT;
}

/**
 * Consume one added dish from the limit. Returns the new counter.
 * Call only when a dish is REALLY saved (not for updates).
 */
export function consumeDish(): number {
  const next = readUsed() + 1;
  writeUsed(next);
  return next;
}
