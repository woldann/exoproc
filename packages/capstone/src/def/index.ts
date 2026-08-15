import { load } from 'bun-xffi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { CapstoneDef } from 'bun-capstone-abi/def';

export { CapstoneDef };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dllPath = join(__dirname, '../deps/capstone.dll');
if (!existsSync(dllPath)) {
  dllPath = join(__dirname, '../../deps/capstone.dll');
}

export const CapstoneImpl = load({
  dll: dllPath,
  dllFuncs: CapstoneDef,
});
