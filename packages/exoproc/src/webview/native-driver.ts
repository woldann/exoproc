import type { WebviewDriver } from './driver.js';

export interface NativeDriverOptions {
  title?: string;
  url: string;
  width?: number;
  height?: number;
  onClose?: () => void;
}

/**
 * Native Webview Driver (e.g. for bun-webview / Windows WebView2 FFI).
 * Operates purely in-memory via C bindings without any local TCP ports.
 */
export class NativeWebviewDriver implements WebviewDriver {
  public options: NativeDriverOptions;
  private bindings = new Map<string, (...args: any[]) => any | Promise<any>>();
  private webviewInstance: any = null;

  constructor(options: NativeDriverOptions) {
    this.options = options;
  }

  public async connect(): Promise<boolean> {
    try {
      // @ts-ignore
      const { Webview } = await import('bun-webview').catch(() => ({}) as any);
      if (Webview) {
        this.webviewInstance = new Webview();
        this.webviewInstance.title = this.options.title || 'Exoproc Cockpit';
        this.webviewInstance.size = {
          width: this.options.width || 1280,
          height: this.options.height || 820,
          hint: 0,
        };
        for (const [name, fn] of this.bindings.entries()) {
          this.webviewInstance.bind(name, fn);
        }
        this.webviewInstance.navigate(this.options.url);
        setTimeout(() => {
          try {
            this.webviewInstance?.run();
            this.options.onClose?.();
          } catch {}
        }, 0);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public bind(name: string, fn: (...args: any[]) => any | Promise<any>): void {
    this.bindings.set(name, fn);
    if (this.webviewInstance?.bind) {
      this.webviewInstance.bind(name, fn);
    }
  }

  public async eval(expression: string): Promise<any> {
    if (this.webviewInstance?.eval) {
      return this.webviewInstance.eval(expression);
    }
    return null;
  }

  public close(): void {
    if (this.webviewInstance?.terminate) {
      try {
        this.webviewInstance.terminate();
      } catch {}
      this.webviewInstance = null;
    }
  }
}
