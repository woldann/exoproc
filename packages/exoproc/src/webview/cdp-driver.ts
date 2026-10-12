import { CdpClient } from '../bridge/cdp-client.js';
import type { WebviewDriver } from './driver.js';

export interface CdpDriverOptions {
  targetUrl?: string;
  injectedScript?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class CdpWebviewDriver implements WebviewDriver {
  private cdp: CdpClient;
  private bindings = new Map<string, (...args: any[]) => any | Promise<any>>();

  constructor(options: CdpDriverOptions = {}) {
    this.cdp = new CdpClient({
      targetUrl: options.targetUrl,
      injectedScript: options.injectedScript,
      onConnect: () => {
        this.injectRpcBridge();
        options.onConnect?.();
      },
      onDisconnect: options.onDisconnect,
      onRpcCall: async (callId: string, fnName: string, args: any[]) => {
        const handler = this.bindings.get(fnName);
        if (!handler) return;
        try {
          const result = await handler(...args);
          this.resolveRpc(callId, result);
        } catch (err: any) {
          this.rejectRpc(callId, err?.message || String(err));
        }
      },
    });
  }

  public async connect(port: number = 9222): Promise<boolean> {
    const ok = await this.cdp.connect(port);
    if (ok) {
      this.injectRpcBridge();
    }
    return ok;
  }

  public bind(name: string, fn: (...args: any[]) => any | Promise<any>): void {
    this.bindings.set(name, fn);
    // Expose on currently running document if already connected
    this.eval(
      `if (typeof window.__neptune_bind_fn === 'function') { window.__neptune_bind_fn(${JSON.stringify(name)}); }`,
    );
  }

  public async eval(expression: string): Promise<any> {
    return this.cdp.evaluate(expression);
  }

  public close(): void {
    this.cdp.close();
  }

  public captureScreenshot(): Promise<string | null> {
    return this.cdp.captureScreenshot();
  }

  private injectRpcBridge() {
    const boundNames = Array.from(this.bindings.keys());
    const initScript = `
      window.__neptune_rpc_resolvers = window.__neptune_rpc_resolvers || {};
      window.__neptune_rpc_rejecters = window.__neptune_rpc_rejecters || {};

      window.__neptune_rpc_resolve = function(callId, result) {
        if (window.__neptune_rpc_resolvers && window.__neptune_rpc_resolvers[callId]) {
          window.__neptune_rpc_resolvers[callId](result);
          delete window.__neptune_rpc_resolvers[callId];
          delete window.__neptune_rpc_rejecters[callId];
        }
      };

      window.__neptune_rpc_reject = function(callId, error) {
        if (window.__neptune_rpc_rejecters && window.__neptune_rpc_rejecters[callId]) {
          window.__neptune_rpc_rejecters[callId](new Error(error));
          delete window.__neptune_rpc_resolvers[callId];
          delete window.__neptune_rpc_rejecters[callId];
        }
      };

      window.__neptune_bind_fn = function(name) {
        window[name] = function(...args) {
          return new Promise(function(resolve, reject) {
            var callId = Math.random().toString(36).substring(2) + Date.now().toString(36);
            window.__neptune_rpc_resolvers[callId] = resolve;
            window.__neptune_rpc_rejecters[callId] = reject;
            if (typeof window.__NEPTUNE_RPC_DISPATCH__ === 'function') {
              window.__NEPTUNE_RPC_DISPATCH__(JSON.stringify({ callId: callId, fnName: name, args: args }));
            } else {
              resolve(null);
            }
          });
        };
      };

      // Register all bound function names on window
      ${JSON.stringify(boundNames)}.forEach(function(fn) {
        window.__neptune_bind_fn(fn);
      });
    `;

    this.eval(initScript);
  }

  private resolveRpc(callId: string, result: any) {
    const serialized = JSON.stringify(result === undefined ? null : result);
    this.eval(
      `if (typeof window.__neptune_rpc_resolve === 'function') { window.__neptune_rpc_resolve(${JSON.stringify(callId)}, ${serialized}); }`,
    );
  }

  private rejectRpc(callId: string, error: string) {
    this.eval(
      `if (typeof window.__neptune_rpc_reject === 'function') { window.__neptune_rpc_reject(${JSON.stringify(callId)}, ${JSON.stringify(error)}); }`,
    );
  }
}
