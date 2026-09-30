/**
 * Dynamically resolves the app URL without hardcoding or requiring VITE_APP_URL env variables.
 * Works on any hosting (Vercel, Render, Netlify, Cloud Run, VPS, etc.) with any random domain name.
 */

export function getAppUrl(): string {
  // 1. Client browser context — accurately detects the current random domain/port
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // 2. Vercel production or preview URL (when running in Node.js on Vercel)
  if (typeof process !== 'undefined' && process.env?.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (typeof process !== 'undefined' && process.env?.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 3. Local fallback for server context
  return 'http://localhost:3000';
}
