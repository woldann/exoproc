import zlib from 'node:zlib';
import { User32Impl, Gdi32Impl } from 'bun-xffi';
import { Window } from 'bun-winapi';

export interface ScreenshotBufferResult {
  success: boolean;
  buffer: Buffer | null;
  width: number;
  height: number;
  windowTitle?: string;
  error?: string;
}

// IEEE 802.3 CRC32 lookup table for PNG encoding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function calcCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = Buffer.alloc(4 + data.length);
  crcTarget.write(type, 0, 4, 'ascii');
  data.copy(crcTarget, 4);
  const crc = calcCrc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + data.length);
  return chunk;
}

export function encodePng(
  width: number,
  height: number,
  bgraBuffer: Buffer,
): Buffer {
  const rowStride = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter Type 0 (None)
    const srcRowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const srcIdx = srcRowOffset + x * 4;
      const dstIdx = rowOffset + 1 + x * 4;
      rawData[dstIdx] = bgraBuffer[srcIdx + 2] ?? 0; // R
      rawData[dstIdx + 1] = bgraBuffer[srcIdx + 1] ?? 0; // G
      rawData[dstIdx + 2] = bgraBuffer[srcIdx] ?? 0; // B
      rawData[dstIdx + 3] = 255; // A (opaque)
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 6 });

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function hasVisiblePixels(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i] !== 0 || buffer[i + 1] !== 0 || buffer[i + 2] !== 0) {
      return true;
    }
  }
  return false;
}

const SRCCOPY = 0x00cc0020;

export interface WindowTarget {
  hwnd: bigint;
  title: string;
  className: string;
  width: number;
  height: number;
  rect: { left: number; top: number; right: number; bottom: number };
}

export function findTargetWindow(
  targetPid?: number | null,
): WindowTarget | null {
  // 1. Direct match for known Minecraft LWJGL window
  const lwjglWin = Window.find('LWJGL', null);
  if (lwjglWin) {
    const [, pid] = lwjglWin.getThreadProcessId();
    if (!targetPid || pid === targetPid) {
      const rect = lwjglWin.getRect() ?? {
        left: 0,
        top: 0,
        right: 854,
        bottom: 480,
      };
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      if (w >= 200 && h >= 150) {
        return {
          hwnd: lwjglWin.rawHandle as bigint,
          title: lwjglWin.getText() || 'Minecraft 1.8.9',
          className: 'LWJGL',
          width: w,
          height: h,
          rect,
        };
      }
    }
  }

  // 2. Scan all windows matching process
  try {
    for (const win of Window.getWindows()) {
      if (!win.isValid()) continue;
      const [, pid] = win.getThreadProcessId();
      if (targetPid && pid !== targetPid) continue;

      const rect = win.getRect();
      if (!rect) continue;
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      if (w <= 100 || h <= 100) continue;

      const title = win.getText() || '';
      const className = win.getClassName() || '';
      if (className.includes('IME') || title.includes('Default IME')) continue;

      const isMinecraft =
        title.toLowerCase().includes('minecraft') ||
        className.includes('LWJGL') ||
        className.includes('GLFW');

      if (!targetPid && !isMinecraft) continue;

      return {
        hwnd: win.rawHandle as bigint,
        title: title || 'Minecraft',
        className,
        width: w,
        height: h,
        rect,
      };
    }
  } catch {}

  return null;
}

/**
 * In-process capture via active Accessor (NThread).
 * In Wine, OpenGL framebuffers can only be reliably read from within the target process context.
 */
async function captureViaNThread(
  targetHwnd: bigint,
  accessor: any,
  win: WindowTarget,
): Promise<Buffer | null> {
  try {
    // 1. GetClientRect via nthread
    const rcAddr = await accessor.alloc(16);
    await accessor.call(User32Impl.GetClientRect, targetHwnd, rcAddr);
    const rcBuf = await accessor.read(rcAddr, 16);
    await accessor.free(rcAddr);

    let width = rcBuf.readInt32LE(8) - rcBuf.readInt32LE(0);
    let height = rcBuf.readInt32LE(12) - rcBuf.readInt32LE(4);

    if (width <= 200 || height <= 100) {
      width = win.width;
      height = win.height;
    }

    if (width <= 0 || height <= 0) return null;

    // 2. Prepare DCs and compatible bitmap in target process
    const hdcWindow = await accessor.call(User32Impl.GetDC, targetHwnd);
    if (!hdcWindow || hdcWindow === 0n) return null;

    const hdcMem = await accessor.call(Gdi32Impl.CreateCompatibleDC, hdcWindow);
    const hBitmap = await accessor.call(
      Gdi32Impl.CreateCompatibleBitmap,
      hdcWindow,
      width,
      height,
    );
    const hOldBitmap = await accessor.call(
      Gdi32Impl.SelectObject,
      hdcMem,
      hBitmap,
    );

    // 3. BitBlt from window DC directly
    await accessor.call(
      Gdi32Impl.BitBlt,
      hdcMem,
      0,
      0,
      width,
      height,
      hdcWindow,
      0,
      0,
      SRCCOPY,
    );

    // 4. Read pixels via GetDIBits
    const bmiBuf = Buffer.alloc(40);
    bmiBuf.writeUInt32LE(40, 0); // biSize
    bmiBuf.writeInt32LE(width, 4); // biWidth
    bmiBuf.writeInt32LE(-height, 8); // biHeight (negative for top-down)
    bmiBuf.writeUInt16LE(1, 12); // biPlanes
    bmiBuf.writeUInt16LE(32, 14); // biBitCount
    bmiBuf.writeUInt32LE(0, 16); // BI_RGB
    bmiBuf.writeUInt32LE(width * height * 4, 20); // biSizeImage

    const bmiAddr = await accessor.alloc(40);
    await accessor.write(bmiAddr, bmiBuf);

    const pixelSize = width * height * 4;
    const pixelAddr = await accessor.alloc(pixelSize);

    await accessor.call(
      Gdi32Impl.GetDIBits,
      hdcMem,
      hBitmap,
      0,
      height,
      pixelAddr,
      bmiAddr,
      0,
    );
    const pixelBuffer = await accessor.read(pixelAddr, pixelSize);

    // 5. Cleanup GDI resources inside target
    await accessor.free(pixelAddr);
    await accessor.free(bmiAddr);
    await accessor.call(Gdi32Impl.SelectObject, hdcMem, hOldBitmap);
    await accessor.call(Gdi32Impl.DeleteObject, hBitmap);
    await accessor.call(Gdi32Impl.DeleteDC, hdcMem);
    await accessor.call(User32Impl.ReleaseDC, targetHwnd, hdcWindow);

    if (hasVisiblePixels(pixelBuffer)) {
      win.width = width;
      win.height = height;
      return pixelBuffer;
    }
  } catch {}

  return null;
}

export async function captureScreenshotBuffer(
  pid?: number | null,
  accessor?: any,
): Promise<ScreenshotBufferResult> {
  try {
    const win = findTargetWindow(pid);
    if (!win) {
      return {
        success: false,
        buffer: null,
        width: 0,
        height: 0,
        error: 'No Minecraft target window found.',
      };
    }

    let pixelBuffer: Buffer | null = null;
    let width = win.width;
    let height = win.height;

    // Strategy 1: In-process NThread capture via accessor
    if (accessor) {
      pixelBuffer = await captureViaNThread(win.hwnd, accessor, win);
      if (pixelBuffer) {
        width = win.width;
        height = win.height;
      }
    }

    // Strategy 2: Direct Window GDI capture fallback
    if (!pixelBuffer) {
      const hdcTarget = User32Impl.GetDC(win.hwnd);
      if (hdcTarget && hdcTarget !== 0n) {
        const hdcMem = Gdi32Impl.CreateCompatibleDC(hdcTarget);
        const hBitmap = Gdi32Impl.CreateCompatibleBitmap(
          hdcTarget,
          width,
          height,
        );
        Gdi32Impl.SelectObject(hdcMem, hBitmap);

        Gdi32Impl.BitBlt(hdcMem, 0, 0, width, height, hdcTarget, 0, 0, SRCCOPY);

        const bmi = Buffer.alloc(40);
        bmi.writeUInt32LE(40, 0);
        bmi.writeInt32LE(width, 4);
        bmi.writeInt32LE(-height, 8);
        bmi.writeUInt16LE(1, 12);
        bmi.writeUInt16LE(32, 14);
        bmi.writeUInt32LE(0, 16);
        bmi.writeUInt32LE(width * height * 4, 20);

        const raw = Buffer.alloc(width * height * 4);
        Gdi32Impl.GetDIBits(hdcMem, hBitmap, 0, height, raw, bmi, 0);

        if (hasVisiblePixels(raw)) {
          pixelBuffer = raw;
        } else {
          // Wine OpenGL fallback: BitBlt from Desktop DC with window coordinates
          const hdcDesktop = User32Impl.GetDC(0n);
          if (hdcDesktop && hdcDesktop !== 0n) {
            Gdi32Impl.BitBlt(
              hdcMem,
              0,
              0,
              width,
              height,
              hdcDesktop,
              win.rect.left,
              win.rect.top,
              SRCCOPY,
            );
            Gdi32Impl.GetDIBits(hdcMem, hBitmap, 0, height, raw, bmi, 0);
            User32Impl.ReleaseDC(0n, hdcDesktop);
            if (hasVisiblePixels(raw)) {
              pixelBuffer = raw;
            }
          }
        }

        Gdi32Impl.DeleteObject(hBitmap);
        Gdi32Impl.DeleteDC(hdcMem);
        User32Impl.ReleaseDC(win.hwnd, hdcTarget);
      }
    }

    if (!pixelBuffer) {
      return {
        success: false,
        buffer: null,
        width: 0,
        height: 0,
        error: 'Target buffer contained only blank pixels.',
      };
    }

    const pngBuffer = encodePng(width, height, pixelBuffer);
    return {
      success: true,
      buffer: pngBuffer,
      width,
      height,
      windowTitle: win.title,
    };
  } catch (err: any) {
    return {
      success: false,
      buffer: null,
      width: 0,
      height: 0,
      error: err?.message || String(err),
    };
  }
}
