import { createRequire } from 'node:module';

let pkgVersion = '0.3.0';
try {
  const req = createRequire(import.meta.url);
  const pkg = req('../package.json');
  if (pkg?.version) {
    pkgVersion = pkg.version;
  }
} catch {
  // Fallback to static version
}

export const VERSION = pkgVersion;
