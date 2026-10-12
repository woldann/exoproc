import type { NeptuneClient } from '../client.js';
import { ReactiveWebviewBridge } from '../bridge/reactive-bridge.js';
import { CdpWebviewDriver } from './cdp-driver.js';
import { NativeWebviewDriver } from './native-driver.js';
import type { WebviewDriver } from './driver.js';

export interface WebviewWindowOptions {
  title?: string;
  url: string;
  width?: number;
  height?: number;
  apiKey?: string;
  client?: NeptuneClient;
  engineUrl?: string;
  borderless?: boolean;
  debug?: boolean;
  port?: number;
  driver?: 'cdp' | 'native' | 'auto';
  sessionNonce?: string;
  onClose?: () => void;
  onDisconnect?: () => void;
}

export class WebviewWindow {
  public bridge?: ReactiveWebviewBridge;
  public driver: WebviewDriver;
  private client?: NeptuneClient;

  constructor(private options: WebviewWindowOptions) {
    this.client = options.client;

    const handleClose = () => {
      this.options.onClose?.();
      this.options.onDisconnect?.();
    };

    // If an explicit port is passed or driver is 'cdp', use CDP driver.
    // Otherwise, default to native webview driver (WebView2 / bun-webview).
    if (options.port || options.driver === 'cdp') {
      this.driver = new CdpWebviewDriver({
        targetUrl: options.url,
        onDisconnect: handleClose,
      });
    } else {
      this.driver = new NativeWebviewDriver({
        title: options.title,
        url: options.url,
        width: options.width,
        height: options.height,
        onClose: handleClose,
      });
    }

    if (this.client) {
      this.bridge = new ReactiveWebviewBridge(
        this.client,
        options.url,
        this.driver,
        options.sessionNonce,
      );
    }
  }

  public async launch(): Promise<boolean> {
    const port = this.options.port;

    // 1. If explicit port or CDP driver:
    if (port || this.options.driver === 'cdp') {
      const targetPort = port || 9222;
      if (this.bridge) {
        return await this.bridge.connect(targetPort);
      }
      return await this.driver.connect(targetPort);
    }

    // 2. Default: Native Webview Driver
    return await this.driver.connect();
  }

  public close() {
    if (this.bridge) {
      this.bridge.close();
    }
    this.driver.close();
  }
}

export async function openDesktopCockpit(
  options: WebviewWindowOptions,
): Promise<WebviewWindow> {
  const window = new WebviewWindow(options);
  await window.launch();
  return window;
}
