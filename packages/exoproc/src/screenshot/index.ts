import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import chalk from 'chalk';
let _xffi: any = null;
let _winapi: any = null;
let _accessors: any = null;

function getXffi() {
  if (!_xffi) {
    if (process.platform !== 'win32') {
      throw new Error(
        'Native GDI window capture requires Windows or Wine environment',
      );
    }
    _xffi = require('bun-xffi');
  }
  return _xffi;
}

function getWinApi() {
  if (!_winapi) {
    if (process.platform !== 'win32') {
      throw new Error(
        'Native Windows API requires Windows or Wine environment',
      );
    }
    _winapi = require('bun-winapi');
  }
  return _winapi;
}

function getAccessors() {
  if (!_accessors) {
    if (process.platform !== 'win32') {
      throw new Error(
        'Native process accessors require Windows or Wine environment',
      );
    }
    _accessors = require('exoproc-accessors');
  }
  return _accessors;
}

export interface ScreenshotOptions {
  pid?: number | null;
  outputPath?: string | null;
  log?: (msg: string) => void;
  accessor?: any;
  captureDesktop?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  filePath: string;
  width: number;
  height: number;
  windowTitle?: string;
  hwnd?: bigint;
}

/**
 * Standard IEEE 802.3 CRC32 lookup table for PNG encoding.
 */
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

/**
 * Pure TypeScript RGBA/BGRA to PNG file encoder without native image dependencies.
 */
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

  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  // IHDR: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression: Deflate
  ihdrData[11] = 0; // Filter: Default
  ihdrData[12] = 0; // Interlace: None
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = makePngChunk('IDAT', compressed);

  // IEND Chunk
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Encodes a 32-bit BGRA buffer into an uncompressed BMP file buffer.
 */
export function encodeBmp(
  width: number,
  height: number,
  bgraBuffer: Buffer,
): Buffer {
  const rowSize = width * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;

  const bmp = Buffer.alloc(fileSize);
  bmp.write('BM', 0, 2, 'ascii'); // bfType
  bmp.writeUInt32LE(fileSize, 2); // bfSize
  bmp.writeUInt32LE(54, 10); // bfOffBits
  bmp.writeUInt32LE(40, 14); // biSize
  bmp.writeInt32LE(width, 18); // biWidth
  bmp.writeInt32LE(-height, 22); // biHeight (negative for top-down)
  bmp.writeUInt16LE(1, 26); // biPlanes
  bmp.writeUInt16LE(32, 28); // biBitCount (32 bpp BGRA)
  bmp.writeUInt32LE(0, 30); // biCompression (BI_RGB)
  bmp.writeUInt32LE(imageSize, 34); // biSizeImage
  bmp.writeInt32LE(2835, 38); // biXPelsPerMeter
  bmp.writeInt32LE(2835, 42); // biYPelsPerMeter

  bgraBuffer.copy(bmp, 54, 0, imageSize);
  return bmp;
}

function hasVisiblePixels(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i] !== 0 || buffer[i + 1] !== 0 || buffer[i + 2] !== 0) {
      return true;
    }
  }
  return false;
}

export interface WindowTarget {
  hwnd: bigint;
  title: string;
  className: string;
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * Finds the best displayable window corresponding to the given target PID.
 */
export function findWindowByPid(
  targetPid?: number | null,
): WindowTarget | null {
  const { Window } = getWinApi();
  // 1. Direct match for known Minecraft windows with valid dimensions
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
          rect,
        };
      }
    }
  }

  const mcWin =
    Window.find(null, 'Minecraft 1.8.9') ||
    Window.find(null, 'Minecraft 1.8.9 ');
  if (mcWin) {
    const [, pid] = mcWin.getThreadProcessId();
    if (!targetPid || pid === targetPid) {
      const rect = mcWin.getRect() ?? {
        left: 0,
        top: 0,
        right: 854,
        bottom: 480,
      };
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      if (w >= 200 && h >= 150) {
        return {
          hwnd: mcWin.rawHandle as bigint,
          title: mcWin.getText() || 'Minecraft 1.8.9',
          className: mcWin.getClassName() || 'LWJGL',
          rect,
        };
      }
    }
  }

  let best: (WindowTarget & { score: number }) | null = null;

  try {
    for (const win of Window.getWindows()) {
      if (!win.isValid()) continue;
      const [, pid] = win.getThreadProcessId();
      if (targetPid && pid !== targetPid) continue;

      const rect = win.getRect();
      if (!rect) continue;
      const width = rect.right - rect.left;
      const height = rect.bottom - rect.top;
      if (width <= 32 || height <= 32) continue;

      const title = win.getText() || '';
      const className = win.getClassName() || '';

      // Skip IME and system background windows
      if (className.includes('IME') || title.includes('Default IME')) continue;

      const area = width * height;

      let score = area;
      const lowerTitle = title.toLowerCase();
      const isMinecraft =
        lowerTitle.includes('minecraft') ||
        className.includes('LWJGL') ||
        className.includes('GLFW');

      // If no specific PID requested (auto-detect), REQUIRE it to be a real Minecraft window
      if (!targetPid && !isMinecraft) {
        continue;
      }

      if (lowerTitle.includes('minecraft')) score += 50000000;
      if (className.includes('LWJGL') || className.includes('GLFW'))
        score += 20000000;
      if (title.length > 0) score += 5000000;

      if (!best || score > best.score) {
        best = {
          hwnd: win.rawHandle as bigint,
          title,
          className,
          rect,
          score,
        };
      }
    }
  } catch {}

  return best;
}

/**
 * Captures a screenshot directly from inside the target process using NThread hijacking.
 * Executes GetClientRect, GetDC, CreateCompatibleDC, CreateCompatibleBitmap, PrintWindow
 * and BitBlt fallback inside the target process thread.
 */
export async function captureScreenshotViaNThread(
  targetPid: number,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult | null> {
  const log = options.log ?? console.log;
  const win = findWindowByPid(targetPid);
  if (!win) {
    return null;
  }

  const targetHwnd = win.hwnd;

  let accessor: any = options.accessor;
  const shouldDeinit = !accessor;

  const { User32Impl, Gdi32Impl } = getXffi();
  const { createAccessor } = getAccessors();

  if (!accessor) {
    log(
      chalk.gray(
        `[NThread] Attaching accessor to target process (PID: ${targetPid})...`,
      ),
    );
    try {
      accessor = await createAccessor(targetPid);
    } catch (err: any) {
      log(
        chalk.yellow(
          `[NThread] Could not attach to process ${targetPid}: ${err?.message || err}`,
        ),
      );
      return null;
    }
  } else {
    log(
      chalk.gray(
        `[NThread] Reusing active process accessor for PID ${targetPid}...`,
      ),
    );
  }

  try {
    // 1. GetClientRect via nthread
    const rcAddr = await accessor.alloc(16);
    await accessor.call(User32Impl.GetClientRect, targetHwnd, rcAddr);
    const rcBuf = await accessor.read(rcAddr, 16);
    await accessor.free(rcAddr);

    const left = rcBuf.readInt32LE(0);
    const top = rcBuf.readInt32LE(4);
    const right = rcBuf.readInt32LE(8);
    const bottom = rcBuf.readInt32LE(12);
    let width = right - left;
    let height = bottom - top;
    if (width <= 200 || height <= 100) {
      try {
        await accessor.call(User32Impl.ShowWindow, targetHwnd, 9n); // SW_RESTORE
        const rcAddr2 = await accessor.alloc(16);
        await accessor.call(User32Impl.GetClientRect, targetHwnd, rcAddr2);
        const rcBuf2 = await accessor.read(rcAddr2, 16);
        await accessor.free(rcAddr2);
        const w2 = rcBuf2.readInt32LE(8) - rcBuf2.readInt32LE(0);
        const h2 = rcBuf2.readInt32LE(12) - rcBuf2.readInt32LE(4);
        if (w2 > 200 && h2 > 100) {
          width = w2;
          height = h2;
        }
      } catch {}
    }

    if (width <= 0 || height <= 0) {
      if (win.rect) {
        width = win.rect.right - win.rect.left;
        height = win.rect.bottom - win.rect.top;
      }
    }
    if (width <= 0 || height <= 0) {
      return null;
    }

    log(chalk.gray(`[NThread] Target window dimensions: ${width}x${height}`));

    // 2. Prepare DCs and compatible bitmap
    const hdcWindow = await accessor.call(User32Impl.GetDC, targetHwnd);
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

    // 3. Direct BitBlt from window DC (skips PrintWindow to avoid Wine OpenGL WM_PRINT corruption)
    const SRCCOPY = 0x00cc0020;
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
    bmiBuf.writeInt32LE(-height, 8); // biHeight (top-down)
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

    // 5. Cleanup GDI resources
    await accessor.free(pixelAddr);
    await accessor.free(bmiAddr);
    await accessor.call(Gdi32Impl.SelectObject, hdcMem, hOldBitmap);
    await accessor.call(Gdi32Impl.DeleteObject, hBitmap);
    await accessor.call(Gdi32Impl.DeleteDC, hdcMem);
    await accessor.call(User32Impl.ReleaseDC, targetHwnd, hdcWindow);

    if (!hasVisiblePixels(pixelBuffer)) {
      log(chalk.yellow(`[NThread] Target buffer contained only blank pixels.`));
      return null;
    }

    // Determine output file path
    let outPath = options.outputPath;
    if (!outPath) {
      const workspaceTmp = resolve(process.cwd(), 'tmp');
      try {
        if (!existsSync(workspaceTmp)) {
          mkdirSync(workspaceTmp, { recursive: true });
        }
      } catch {}
      const defaultDir = existsSync(workspaceTmp)
        ? workspaceTmp
        : process.env.TEMP || process.env.TMP || tmpdir();

      const timestamp = Date.now();
      outPath = resolve(defaultDir, `screenshot-${timestamp}.png`);
    } else {
      outPath = resolve(process.cwd(), outPath);
    }

    const pngBuffer = encodePng(width, height, pixelBuffer);
    writeFileSync(outPath, pngBuffer);

    try {
      const bmpPath = outPath.replace(/\.png$/i, '.bmp');
      if (bmpPath !== outPath) {
        const bmpBuffer = encodeBmp(width, height, pixelBuffer);
        writeFileSync(bmpPath, bmpBuffer);
      }
    } catch {}

    const absPath = resolve(outPath);
    log(chalk.bold.green(`✓ Screenshot captured successfully via NThread!`));
    log(`  ${chalk.cyan('Target Window:')} ${win.title || 'Minecraft'}`);
    log(`  ${chalk.cyan('Resolution:')}    ${width}x${height}`);
    log(`  ${chalk.cyan('File Path:')}     ${absPath}`);
    log(
      `  ${chalk.cyan('URI:')}           file://${absPath.replace(/\\/g, '/')}`,
    );

    return {
      success: true,
      filePath: absPath,
      width,
      height,
      windowTitle: win.title,
      hwnd: win.hwnd,
    };
  } finally {
    // Only deinitialize accessor if we created it locally (preserves existing injected host)
    if (shouldDeinit && accessor) {
      try {
        await accessor.deinit();
      } catch {}
    }
  }
}

/**
 * Captures a screenshot of the specified window or the full screen.
 * Tries NThread in-process capture first, then falls back to desktop GDI capture.
 */
export async function captureScreenshot(
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const log = options.log ?? console.log;
  const targetPid = options.pid ?? null;

  // 1. Primary Strategy: In-process capture via NThread
  if (targetPid) {
    try {
      const nthreadResult = await captureScreenshotViaNThread(
        targetPid,
        options,
      );
      if (nthreadResult) {
        return nthreadResult;
      }
    } catch (err: any) {
      log(
        chalk.yellow(
          `[NThread] In-process capture failed: ${err?.message || err}, falling back to GDI...`,
        ),
      );
    }
  }

  // 2. Secondary Strategy: Window GDI capture fallback
  const win = findWindowByPid(targetPid);
  if (!win && !options.captureDesktop) {
    if (targetPid) {
      throw new Error(
        `Target window for PID ${targetPid} was not found or is closed.`,
      );
    } else {
      throw new Error(
        'No running Minecraft / target process window found to capture.',
      );
    }
  }

  const { User32Impl, Gdi32Impl } = getXffi();
  const hwnd = win ? win.hwnd : (User32Impl.GetDesktopWindow?.() ?? 0n);

  let width = 0;
  let height = 0;

  if (win && win.rect) {
    width = win.rect.right - win.rect.left;
    height = win.rect.bottom - win.rect.top;
  }

  // Fallback to screen metrics if dimensions are invalid
  if (width <= 0 || height <= 0) {
    width = User32Impl.GetSystemMetrics(0); // SM_CXSCREEN
    height = User32Impl.GetSystemMetrics(1); // SM_CYSCREEN
  }
  if (width <= 0) width = 1920;
  if (height <= 0) height = 1080;

  // Bring window to foreground if available to ensure frame rendering
  if (hwnd && hwnd !== 0n && User32Impl.SetForegroundWindow) {
    try {
      User32Impl.SetForegroundWindow(hwnd);
    } catch {}
  }

  const hdcTarget =
    hwnd && hwnd !== 0n ? User32Impl.GetDC(hwnd) : User32Impl.GetDC(0n);
  if (!hdcTarget || hdcTarget === 0n) {
    throw new Error('Failed to acquire GDI Device Context (GetDC returned 0).');
  }

  const Gdi = Gdi32Impl as any;
  const hdcMem = Gdi.CreateCompatibleDC(hdcTarget);
  const hBitmap = Gdi.CreateCompatibleBitmap(hdcTarget, width, height);
  Gdi.SelectObject(hdcMem, hBitmap);

  // Attempt PrintWindow
  let captured = false;
  if (hwnd && hwnd !== 0n && User32Impl.PrintWindow) {
    try {
      captured = !!User32Impl.PrintWindow(
        hwnd,
        hdcMem,
        2 /* PW_RENDERFULLCONTENT */,
      );
      if (!captured) {
        captured = !!User32Impl.PrintWindow(hwnd, hdcMem, 0);
      }
    } catch {}
  }

  // Fallback to BitBlt
  const SRCCOPY = 0x00cc0020;
  if (!captured) {
    try {
      Gdi.BitBlt(hdcMem, 0, 0, width, height, hdcTarget, 0, 0, SRCCOPY);
      captured = true;
    } catch {}
  }

  // Read raw pixels
  const bmi = Buffer.alloc(40);
  bmi.writeUInt32LE(40, 0); // biSize
  bmi.writeInt32LE(width, 4); // biWidth
  bmi.writeInt32LE(-height, 8); // biHeight (negative for top-down)
  bmi.writeUInt16LE(1, 12); // biPlanes
  bmi.writeUInt16LE(32, 14); // biBitCount
  bmi.writeUInt32LE(0, 16); // BI_RGB
  bmi.writeUInt32LE(width * height * 4, 20); // biSizeImage

  const pixelBuffer = Buffer.alloc(width * height * 4);
  Gdi.GetDIBits(hdcMem, hBitmap, 0, height, pixelBuffer, bmi, 0);

  // Fallback: If window DC gave all-black pixels (common in Wine OpenGL), BitBlt from Desktop DC
  if (!hasVisiblePixels(pixelBuffer) && win && win.rect) {
    try {
      const hdcDesktop = User32Impl.GetDC(0n);
      if (hdcDesktop && hdcDesktop !== 0n) {
        Gdi.BitBlt(
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
        Gdi.GetDIBits(hdcMem, hBitmap, 0, height, pixelBuffer, bmi, 0);
        User32Impl.ReleaseDC(0n, hdcDesktop);
      }
    } catch {}
  }

  // Cleanup GDI objects
  Gdi.DeleteObject(hBitmap);
  Gdi.DeleteDC(hdcMem);
  if (hdcTarget) {
    User32Impl.ReleaseDC(hwnd ?? 0n, hdcTarget);
  }

  // Determine output location
  let outPath = options.outputPath;
  if (!outPath) {
    const workspaceTmp = resolve(process.cwd(), 'tmp');
    try {
      if (!existsSync(workspaceTmp)) {
        mkdirSync(workspaceTmp, { recursive: true });
      }
    } catch {}
    const defaultDir = existsSync(workspaceTmp)
      ? workspaceTmp
      : process.env.TEMP || process.env.TMP || tmpdir();

    const timestamp = Date.now();
    outPath = resolve(defaultDir, `screenshot-${timestamp}.png`);
  } else {
    outPath = resolve(process.cwd(), outPath);
  }

  // Encode and save PNG
  const pngBuffer = encodePng(width, height, pixelBuffer);
  writeFileSync(outPath, pngBuffer);

  // Also save BMP twin alongside if possible for maximum compatibility
  try {
    const bmpPath = outPath.replace(/\.png$/i, '.bmp');
    if (bmpPath !== outPath) {
      const bmpBuffer = encodeBmp(width, height, pixelBuffer);
      writeFileSync(bmpPath, bmpBuffer);
    }
  } catch {}

  const absPath = resolve(outPath);
  log(chalk.bold.green(`✓ Screenshot captured successfully!`));
  log(`  ${chalk.cyan('Target Window:')} ${win?.title || 'Desktop'}`);
  log(`  ${chalk.cyan('Resolution:')}    ${width}x${height}`);
  log(`  ${chalk.cyan('File Path:')}     ${absPath}`);
  log(
    `  ${chalk.cyan('URI:')}           file://${absPath.replace(/\\/g, '/')}`,
  );

  return {
    success: true,
    filePath: absPath,
    width,
    height,
    windowTitle: win?.title,
    hwnd: win?.hwnd,
  };
}
