export interface WebviewDriver {
  connect(port?: number): Promise<boolean>;
  bind(name: string, fn: (...args: any[]) => any | Promise<any>): void;
  eval(expression: string): Promise<any>;
  close(): void;
}
