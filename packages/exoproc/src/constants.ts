/**
 * Central Static Web Cockpit Host URL.
 * Can be statically overridden at build time via BUILD_WEB_URL environment variable.
 */
export const DEFAULT_NEPTUNE_WEB_URL: string =
  (typeof process !== 'undefined' && process.env?.NEPTUNE_WEB_URL) ||
  'http://localhost:8000';

export function generateDynamicApiKey(): string {
  const chars = '0123456789abcdef';
  let token = 'nep_live_';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
