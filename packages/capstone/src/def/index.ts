import { load } from 'bun-xffi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { CapstoneDef } from 'bun-capstone-abi/def';
import { EMBEDDED_CAPSTONE_DLL_BASE64 } from './embedded-capstone.js';

export { CapstoneDef };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findCapstoneDll(): string {
  const candidates = [
    join(__dirname, 'capstone.dll'),
    join(__dirname, '../capstone.dll'),
    join(__dirname, '../deps/capstone.dll'),
    join(__dirname, '../../deps/capstone.dll'),
    join(__dirname, '../../../packages/capstone/deps/capstone.dll'),
    join(__dirname, '../../../../packages/capstone/deps/capstone.dll'),
    join(process.cwd(), 'packages/capstone/deps/capstone.dll'),
    join(tmpdir(), 'neptune_capstone.dll'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Auto-extract embedded DLL into temp directory if available
  if (
    typeof EMBEDDED_CAPSTONE_DLL_BASE64 === 'string' &&
    EMBEDDED_CAPSTONE_DLL_BASE64.length > 0
  ) {
    const tempDllPath = join(tmpdir(), 'neptune_capstone.dll');
    try {
      if (!existsSync(tempDllPath)) {
        writeFileSync(
          tempDllPath,
          Buffer.from(EMBEDDED_CAPSTONE_DLL_BASE64, 'base64'),
        );
      }
      return tempDllPath;
    } catch {}
  }

  return join(__dirname, '../deps/capstone.dll');
}

export const CapstoneImpl = load({
  dll: findCapstoneDll(),
  dllFuncs: CapstoneDef,
});
