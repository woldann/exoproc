export interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
}

export interface CdpClientOptions {
  injectedScript?: string;
  targetUrl?: string;
  onMessage?: (message: any) => void;
  onRpcCall?: (callId: string, fnName: string, args: any[]) => void;
  onConnect?: (target: CdpTarget) => void;
  onDisconnect?: () => void;
}

export class CdpClient {
  private ws: WebSocket | null = null;
  private seq = 1;
  private isConnecting = false;
  private activeTarget: CdpTarget | null = null;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  private healthTimer: any = null;
  private isDisconnected = false;
  private hasConnectedOnce = false;

  constructor(private options: CdpClientOptions) {}

  public async connect(
    port: number = 9222,
    maxAttempts: number = 50,
  ): Promise<boolean> {
    if (this.isConnecting) return false;
    this.isConnecting = true;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let res = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(800),
        }).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`http://127.0.0.1:${port}/json`, {
            signal: AbortSignal.timeout(800),
          }).catch(() => null);
        }
        if (!res || !res.ok) {
          res = await fetch(`http://localhost:${port}/json/list`, {
            signal: AbortSignal.timeout(800),
          }).catch(() => null);
        }

        if (res && res.ok) {
          const targets = (await res.json()) as CdpTarget[];

          // Prefer web page target matching targetUrl or Deno console / localhost
          const pageTarget =
            (this.options.targetUrl
              ? targets.find(
                  (t) =>
                    (t.type === 'page' || !t.type) &&
                    t.url?.includes(this.options.targetUrl!),
                )
              : null) ||
            targets.find(
              (t) =>
                (t.type === 'page' || !t.type) &&
                (t.url?.includes('localhost') ||
                  t.url?.includes('8000') ||
                  t.url?.includes('console') ||
                  !t.url?.startsWith('chrome://')) &&
                !t.url?.startsWith('chrome-extension://') &&
                t.webSocketDebuggerUrl,
            ) ||
            targets.find(
              (t) =>
                (t.type === 'page' || !t.type) &&
                !t.url?.startsWith('chrome://') &&
                t.webSocketDebuggerUrl,
            );

          if (pageTarget?.webSocketDebuggerUrl) {
            this.activeTarget = pageTarget;
            const wsUrl = pageTarget.webSocketDebuggerUrl
              .replace('[::1]', '127.0.0.1')
              .replace('localhost', '127.0.0.1');

            const ws = new WebSocket(wsUrl);
            this.ws = ws;

            return new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => {
                this.isConnecting = false;
                try {
                  ws.close();
                } catch {}
                resolve(false);
              }, 4000);

              ws.onopen = async () => {
                clearTimeout(timer);
                this.isConnecting = false;
                this.hasConnectedOnce = true;
                this.isDisconnected = false;
                console.log(
                  `[Exoproc Engine] ✓ DevTools CDP connected to Deno Cockpit: ${pageTarget.url}`,
                );

                this.send('Runtime.enable');
                this.send('Page.enable');
                this.send('Runtime.addBinding', {
                  name: '__EXOPROC_RPC_DISPATCH__',
                });
                this.send('Runtime.addBinding', { name: '__EXOPROC_IPC__' });
                this.send('Runtime.addBinding', { name: '__WEBVIEW_IPC__' });
                this.send('Runtime.addBinding', {
                  name: '__exoproc_native_ping',
                });

                const nativeEarlyScript = `
                  window.__EXOPROC_NATIVE__ = true;
                  window.__EXOPROC_LAUNCHED__ = true;
                  window.__EXOPROC_ENGINE_ATTACHED__ = true;
                  window.__EXOPROC_VERSION__ = "1.0.0";
                  window.__EXOPROC_CDP_READY__ = true;
                  try {
                    if (typeof window.sessionStorage !== 'undefined') {
                      window.sessionStorage.setItem("exoproc_is_native", "1");
                    }
                  } catch {}
                  if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('exoproc:native-ready', { detail: { native: true } }));
                  }
                `;
                this.send('Page.addScriptToEvaluateOnNewDocument', {
                  source: nativeEarlyScript,
                });
                this.send('Runtime.evaluate', {
                  expression: nativeEarlyScript,
                });

                if (
                  this.options.targetUrl &&
                  pageTarget.url !== this.options.targetUrl
                ) {
                  this.send('Page.navigate', { url: this.options.targetUrl });
                }

                if (this.options.injectedScript) {
                  this.send('Page.addScriptToEvaluateOnNewDocument', {
                    source: this.options.injectedScript,
                  });
                  this.send('Runtime.evaluate', {
                    expression: this.options.injectedScript,
                  });
                }

                if (this.options.onConnect) {
                  this.options.onConnect(pageTarget);
                }

                this.startHealthMonitor(port);
                resolve(true);
              };

              ws.onerror = () => {
                clearTimeout(timer);
                this.isConnecting = false;
                if (this.hasConnectedOnce) {
                  this.handleDisconnect('WebSocket error');
                }
                resolve(false);
              };

              ws.onclose = () => {
                this.handleDisconnect('WebSocket closed');
              };

              ws.onmessage = (event) => {
                this.handleCdpMessage(event.data);
              };
            });
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    this.isConnecting = false;
    return false;
  }

  private startHealthMonitor(port: number) {
    if (this.healthTimer) clearInterval(this.healthTimer);
    let consecutiveFailures = 0;

    this.healthTimer = setInterval(async () => {
      if (this.isDisconnected) {
        if (this.healthTimer) clearInterval(this.healthTimer);
        return;
      }

      // 1. Check WebSocket status
      if (
        this.ws &&
        (this.ws.readyState === WebSocket.CLOSING ||
          this.ws.readyState === WebSocket.CLOSED)
      ) {
        this.handleDisconnect('WebSocket connection closed');
        return;
      }

      // 2. Check HTTP CDP endpoint status
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(600),
        }).catch(() => null);

        if (!res || !res.ok) {
          consecutiveFailures++;
          if (consecutiveFailures >= 2) {
            this.handleDisconnect(`CDP port ${port} unreachable`);
          }
        } else {
          consecutiveFailures = 0;
        }
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 2) {
          this.handleDisconnect(`CDP port ${port} unreachable`);
        }
      }
    }, 1000);
  }

  private handleDisconnect(reason: string = 'Connection closed') {
    if (this.isDisconnected) return;
    this.isDisconnected = true;
    console.log(`[Exoproc Engine] ℹ DevTools CDP connection closed: ${reason}`);

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (this.options.onDisconnect) {
      this.options.onDisconnect();
    }
  }

  public send(method: string, params: Record<string, any> = {}): number {
    const id = ++this.seq;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ id, method, params }));
    }
    return id;
  }

  public call(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = this.send(method, params);
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        resolve(null);
      }, 3000);
      this.pendingCallbacks.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

  public async captureScreenshot(): Promise<string | null> {
    const res = await this.call('Page.captureScreenshot', { format: 'png' });
    return res?.data || null;
  }

  public evaluate(expression: string) {
    this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} return true; })()`,
      returnByValue: false,
    });
  }

  private handleCdpMessage(rawData: any) {
    try {
      const msg = JSON.parse(
        typeof rawData === 'string' ? rawData : rawData.toString(),
      );

      if (msg.id && this.pendingCallbacks.has(msg.id)) {
        const cb = this.pendingCallbacks.get(msg.id);
        this.pendingCallbacks.delete(msg.id);
        cb?.(msg.result);
        return;
      }

      if (
        msg.method === 'Page.loadEventFired' ||
        msg.method === 'Page.domContentEventFired' ||
        msg.method === 'Page.frameNavigated' ||
        msg.method === 'Runtime.executionContextCreated'
      ) {
        this.send('Runtime.addBinding', { name: '__EXOPROC_RPC_DISPATCH__' });
        this.send('Runtime.addBinding', { name: '__EXOPROC_IPC__' });
        this.send('Runtime.addBinding', { name: '__WEBVIEW_IPC__' });
        if (this.options.injectedScript) {
          this.send('Runtime.evaluate', {
            expression: this.options.injectedScript,
          });
        }
        if (this.options.onConnect && this.activeTarget) {
          this.options.onConnect(this.activeTarget);
        }
        return;
      }

      if (
        msg.method === 'Runtime.bindingCalled' &&
        msg.params?.name === '__EXOPROC_RPC_DISPATCH__'
      ) {
        try {
          const payload =
            typeof msg.params.payload === 'string'
              ? JSON.parse(msg.params.payload)
              : msg.params.payload;
          if (this.options.onRpcCall) {
            this.options.onRpcCall(
              payload.callId,
              payload.fnName,
              payload.args || [],
            );
          }
        } catch {}
        return;
      }

      if (
        msg.method === 'Runtime.bindingCalled' &&
        (msg.params?.name === '__EXOPROC_IPC__' ||
          msg.params?.name === '__WEBVIEW_IPC__')
      ) {
        const payload = JSON.parse(msg.params.payload);
        if (this.options.onMessage) this.options.onMessage(payload);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const firstArg = msg.params?.args?.[0]?.value;
        if (typeof firstArg === 'string') {
          if (firstArg.startsWith('__EXOPROC_IPC__:')) {
            const payload = JSON.parse(firstArg.slice(16));
            if (this.options.onMessage) this.options.onMessage(payload);
          } else if (firstArg.startsWith('__WEBVIEW_IPC__:')) {
            const payload = JSON.parse(firstArg.slice(16));
            if (this.options.onMessage) this.options.onMessage(payload);
          }
        }
      }
    } catch {}
  }

  public close() {
    this.isDisconnected = true;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
