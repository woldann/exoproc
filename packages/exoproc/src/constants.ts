/**
 * Central Static Web Cockpit Host URL.
 * Can be statically overridden at build time via BUILD_WEB_URL environment variable.
 */
export const DEFAULT_EXOPROC_WEB_URL: string =
  (typeof process !== 'undefined' && process.env?.EXOPROC_WEB_URL) ||
  'http://localhost:8000';

export function generateDynamicApiKey(): string {
  const chars = '0123456789abcdef';
  let token = 'exo_live_';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
