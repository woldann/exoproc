import { service } from './service.js';
import * as client from './client.js';
import { VERSION } from './version.js';

export interface ServerOptions {
  port?: number;
  host?: string;
}

export interface SseEmitter {
  send: (event: string, data: any) => void;
  close: () => void;
  error: (err: any) => void;
}

export function sseResponse(
  handler: (emitter: SseEmitter) => Promise<void> | void,
): Response {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      const emitter: SseEmitter = {
        send: (event: string, data: any) => {
          if (isClosed) return;
          const payload =
            typeof data === 'string' ? data : JSON.stringify(data);
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${payload}\n\n`),
          );
        },
        close: () => {
          if (isClosed) return;
          isClosed = true;
          try {
            controller.close();
          } catch {}
        },
        error: (err: any) => {
          if (isClosed) return;
          const msg = err instanceof Error ? err.message : String(err);
          emitter.send('error', { success: false, error: msg });
          emitter.close();
        },
      };

      Promise.resolve(handler(emitter)).catch((err) => {
        emitter.error(err);
      });
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export interface RunningApiServer {
  port: number;
  hostname: string;
  stop: () => void;
}

export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const pathname = url.pathname;
  const acceptHeader = req.headers.get('Accept') || '';
  const wantsSse =
    acceptHeader.includes('text/event-stream') ||
    url.searchParams.get('format') === 'sse';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  };

  const errorResponse = (err: any, status = 500) => {
    if (wantsSse) {
      return sseResponse((emitter) => {
        emitter.error(err);
      });
    }
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      status,
    );
  };

  // Wrap action returning SSE or JSON based on client request
  const handleAction = async (fn: () => Promise<any>) => {
    if (wantsSse) {
      return sseResponse(async (emitter) => {
        try {
          const res = await fn();
          emitter.send('result', res);
        } catch (err: any) {
          emitter.error(err);
        } finally {
          emitter.close();
        }
      });
    }
    try {
      const res = await fn();
      return jsonResponse(res);
    } catch (err: any) {
      return errorResponse(err);
    }
  };

  let body: any = {};
  if (method === 'POST' || method === 'PUT') {
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {}
  }

  try {
    // SSE Streaming Live Watch Endpoints
    if (method === 'GET' && pathname === '/watch/player') {
      const interval = Math.max(
        100,
        Number(url.searchParams.get('interval')) || 500,
      );
      return sseResponse(async (emitter) => {
        while (true) {
          try {
            const player = await service.getPlayer();
            emitter.send('player', player);
          } catch (err: any) {
            emitter.send('error', { error: err.message });
          }
          await new Promise((r) => setTimeout(r, interval));
        }
      });
    }

    if (method === 'GET' && pathname === '/watch/state') {
      const interval = Math.max(
        200,
        Number(url.searchParams.get('interval')) || 1000,
      );
      return sseResponse(async (emitter) => {
        while (true) {
          try {
            const st = await service.getState();
            emitter.send('state', st);
          } catch (err: any) {
            emitter.send('error', { error: err.message });
          }
          await new Promise((r) => setTimeout(r, interval));
        }
      });
    }

    // World Navigation with real-time SSE progress streaming
    if ((method === 'POST' || method === 'GET') && pathname === '/navigate') {
      const target =
        url.searchParams.get('target') ||
        (body && typeof body === 'object' && body.target) ||
        'InGame';
      if (wantsSse) {
        return sseResponse(async (emitter) => {
          try {
            const res = await service.navigate(target, (step) => {
              emitter.send('progress', { message: step });
            });
            emitter.send('result', res);
          } catch (err: any) {
            emitter.error(err);
          } finally {
            emitter.close();
          }
        });
      }
      const steps: string[] = [];
      const res = await service.navigate(target, (step) => steps.push(step));
      return jsonResponse({ ...res, progressSteps: steps });
    }

    // GUI Screen Crawling with real-time SSE progress streaming
    if ((method === 'POST' || method === 'GET') && pathname === '/crawl') {
      let targets: string[] | undefined;
      const targetParam =
        url.searchParams.get('targets') || url.searchParams.get('screens');
      if (targetParam) {
        targets = targetParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (body && Array.isArray(body.targets)) {
        targets = body.targets;
      } else if (body && Array.isArray(body.screens)) {
        targets = body.screens;
      }

      if (wantsSse) {
        return sseResponse(async (emitter) => {
          try {
            const res = await service.crawl({
              targets,
              onProgress: (msg) => emitter.send('progress', { message: msg }),
            });
            emitter.send('result', res);
          } catch (err: any) {
            emitter.error(err);
          } finally {
            emitter.close();
          }
        });
      }
      const progress: string[] = [];
      const res = await service.crawl({
        targets,
        onProgress: (msg) => progress.push(msg),
      });
      return jsonResponse({ ...res, progress });
    }

    // Export Mappings (with optional automated GUI crawling)
    if (
      (method === 'POST' || method === 'GET') &&
      (pathname === '/mappings/export' || pathname === '/export-mappings')
    ) {
      const profile =
        url.searchParams.get('profile') || body?.profile || '1.8.9';
      const crawl =
        url.searchParams.get('crawl') === 'false'
          ? false
          : (body?.crawl ?? true);
      const outPath = url.searchParams.get('out') || body?.out;
      const minecraft =
        url.searchParams.get('minecraft') === 'true' ||
        Boolean(body?.minecraft);

      if (wantsSse) {
        return sseResponse(async (emitter) => {
          try {
            const res = await service.exportMappings(profile, {
              outPath,
              crawlGuis: crawl,
              minecraft,
              onProgress: (msg) => emitter.send('progress', { message: msg }),
            });
            emitter.send('result', res);
          } catch (err: any) {
            emitter.error(err);
          } finally {
            emitter.close();
          }
        });
      }
      const progress: string[] = [];
      const res = await service.exportMappings(profile, {
        outPath,
        crawlGuis: crawl,
        minecraft,
        onProgress: (msg) => progress.push(msg),
      });
      return jsonResponse({ ...res, progress });
    }

    // GET & HEAD Endpoints
    if (method === 'GET' || method === 'HEAD') {
      switch (pathname) {
        case '/': {
          return jsonResponse({
            name: 'exoproc-api',
            version: VERSION,
            status: 'online',
            engine: 'Bun.serve',
            streaming: 'Server-Sent Events (text/event-stream)',
            endpoints: {
              telemetry: [
                'GET /status',
                'GET /player',
                'GET /world',
                'GET /state',
                'GET /target?reach=30',
                'GET /entities?radius=64',
                'GET /inventory',
                'GET /gui',
                'GET /procs',
                'GET /screenshot (raw image/png or json with base64)',
              ],
              streaming: [
                'GET /navigate (SSE progress stream)',
                'GET /watch/player?interval=500 (SSE live telemetry)',
                'GET /watch/state?interval=1000 (SSE live state)',
              ],
              actions: [
                'POST /chat { message }',
                'POST /look { yaw, pitch }',
                'POST /action { action: "swing"|"attack"|"use"|"jump" }',
                'POST /jump',
                'POST /attack',
                'POST /use',
                'POST /slot { slot: 0-8 }',
                'POST /click { selector: id|text }',
                'POST /close-screen',
                'POST /resume',
                'POST /navigate',
                'POST /eval { code }',
                'POST /screenshot { path? }',
              ],
            },
          });
        }
        case '/status': {
          return handleAction(async () => {
            const status = await service.getStatus();
            return (
              status || { alive: false, message: 'Daemon is not reachable' }
            );
          });
        }
        case '/upgrade':
        case '/upgrade-agent': {
          return handleAction(() => service.upgrade(body));
        }
        case '/procs': {
          return handleAction(() => service.listProcesses());
        }
        case '/gui': {
          const includePool = url.searchParams.get('pool') === 'true';
          return handleAction(() => service.getGui({ includePool }));
        }
        case '/player': {
          return handleAction(() => service.getPlayer());
        }
        case '/world': {
          return handleAction(() => service.getWorld());
        }
        case '/state': {
          return handleAction(() => service.getState());
        }
        case '/target': {
          const reach = url.searchParams.get('reach')
            ? Number(url.searchParams.get('reach'))
            : 30;
          return handleAction(() => service.getTarget(reach));
        }
        case '/entities': {
          const radius = url.searchParams.get('radius')
            ? Number(url.searchParams.get('radius'))
            : 64;
          return handleAction(() => service.getEntities(radius));
        }
        case '/inventory': {
          return handleAction(() => service.getInventory());
        }
        case '/java':
        case '/inspect-java': {
          return handleAction(() => service.getJava());
        }
        case '/pool': {
          const target = url.searchParams.get('target') || undefined;
          return handleAction(() => service.pool(target));
        }
        case '/database': {
          const target = url.searchParams.get('target') || undefined;
          return handleAction(() => service.database(target));
        }
        case '/minecraft/status': {
          return handleAction(async () => {
            const isMc = await service.isMinecraft();
            const mappings = client.getMinecraftMappings();
            return {
              isMinecraft: isMc,
              initialized: Boolean(mappings),
              classesMapped: mappings ? Object.keys(mappings).length : 0,
            };
          });
        }
        case '/screenshot':
        case '/screenshot.png': {
          const shot = await service.fetchScreenshot();
          const base64 = shot.base64 || shot.buffer.toString('base64');
          if (wantsSse) {
            return sseResponse((emitter) => {
              emitter.send('result', {
                success: true,
                width: shot.width,
                height: shot.height,
                size: shot.buffer.length,
                base64,
              });
              emitter.close();
            });
          }
          if (
            acceptHeader.includes('application/json') ||
            url.searchParams.get('format') === 'json'
          ) {
            return jsonResponse({
              success: true,
              width: shot.width,
              height: shot.height,
              size: shot.buffer.length,
              base64,
            });
          }
          return new Response(shot.buffer, {
            headers: {
              'Content-Type': 'image/png',
              'Content-Length': String(shot.buffer.length),
              'X-Image-Width': String(shot.width || 0),
              'X-Image-Height': String(shot.height || 0),
              'Cache-Control': 'no-cache',
              ...corsHeaders,
            },
          });
        }
        case '/agent/dump':
        case '/agent/extract': {
          const format = url.searchParams.get('format') as any;
          const path = url.searchParams.get('path') || undefined;
          const javaVersion = url.searchParams.get('javaVersion')
            ? Number(url.searchParams.get('javaVersion'))
            : undefined;
          const obfuscate = url.searchParams.get('obfuscate') !== 'false';
          return handleAction(() =>
            service.dumpAgent({ path, format, javaVersion, obfuscate }),
          );
        }
      }
    }

    // POST Endpoints
    if (method === 'POST') {
      switch (pathname) {
        case '/attach': {
          return handleAction(() => service.attach(body.pid));
        }
        case '/detach': {
          return handleAction(() => service.detach());
        }
        case '/shutdown': {
          return handleAction(() => service.shutdown());
        }
        case '/click': {
          const selector =
            body.id !== undefined
              ? body.id
              : body.text !== undefined
                ? body.text
                : body.selector;
          if (selector === undefined) {
            return errorResponse(new Error('Missing button id or text'), 400);
          }
          return handleAction(() => service.click(selector));
        }
        case '/close-screen': {
          return handleAction(() => service.closeScreen());
        }
        case '/resume': {
          return handleAction(() => service.resume());
        }
        case '/chat': {
          if (!body.message) {
            return errorResponse(new Error('Missing message body'), 400);
          }
          return handleAction(() => service.chat(body.message));
        }
        case '/look': {
          if (body.yaw === undefined || body.pitch === undefined) {
            return errorResponse(new Error('Missing yaw or pitch'), 400);
          }
          return handleAction(() =>
            service.look(Number(body.yaw), Number(body.pitch)),
          );
        }
        case '/action': {
          if (!body.action) {
            return errorResponse(
              new Error('Missing action (swing/attack/use/jump)'),
              400,
            );
          }
          return handleAction(() => service.action(body.action));
        }
        case '/jump': {
          return handleAction(() => service.jump());
        }
        case '/attack': {
          return handleAction(() => service.attack());
        }
        case '/use': {
          return handleAction(() => service.use());
        }
        case '/slot': {
          if (body.index === undefined && body.slot === undefined) {
            return errorResponse(new Error('Missing slot index'), 400);
          }
          const slot =
            body.index !== undefined ? Number(body.index) : Number(body.slot);
          return handleAction(() => service.slot(slot));
        }
        case '/eval': {
          if (!body.code) {
            return errorResponse(new Error('Missing code'), 400);
          }
          return handleAction(() =>
            service.evalCode(body.code, {
              minecraft: Boolean(body.minecraft),
              poolPath: body.pool,
              globals: body.globals,
              timeoutMs: body.timeout,
            }),
          );
        }
        case '/run': {
          const code = body.scriptCode ?? body.code;
          const path = body.scriptPath ?? body.path;
          if (!code && !path) {
            return errorResponse(
              new Error('Missing scriptCode or scriptPath'),
              400,
            );
          }
          return handleAction(() =>
            service.runScript(path, code, body.globals, {
              minecraft: Boolean(body.minecraft),
              poolPath: body.pool,
              timeoutMs: body.timeout,
            }),
          );
        }
        case '/minecraft/init': {
          return handleAction(() => service.initMinecraft(body));
        }
        case '/screenshot': {
          const res = await service.screenshot(body.path);
          if (!res.success) {
            return jsonResponse(res, 500);
          }
          if (!body.includeBase64 && body.path) {
            const { base64: _base64, ...rest } = res;
            return jsonResponse(rest);
          }
          return jsonResponse(res);
        }
        case '/agent/dump':
        case '/agent/extract': {
          return handleAction(() => service.dumpAgent(body));
        }
      }
    }

    return errorResponse(
      new Error(`Route not found: ${method} ${pathname}`),
      404,
    );
  } catch (err: any) {
    return errorResponse(err);
  }
}

export async function startApiServer(
  options: ServerOptions = {},
): Promise<RunningApiServer> {
  const port =
    options.port !== undefined
      ? options.port
      : Number(process.env.API_PORT) || 43370;
  const hostname = options.host || '127.0.0.1';

  const server = Bun.serve({
    port,
    hostname,
    idleTimeout: 120,
    fetch: handleApiRequest,
  });

  return {
    port: server.port ?? port,
    hostname: server.hostname ?? hostname,
    stop: () => server.stop(),
  };
}
