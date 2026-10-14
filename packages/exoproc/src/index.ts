export * from './client.js';
export * from './config/profiles.js';
export * from './accessors/accessor-registry.js';
export * from './tools/tool-manager.js';
export * from './constants.js';
export * from './screenshot/index.js';
export * from './remote/index.js';
export * from './service.js';
export { startApiServer } from './server.js';

import {
  AgentClient,
  createAgentClient,
  evalAgent,
  dumpAgent,
  type AgentStatus,
  type AgentEvalResult,
  type AgentDumpOptions,
  type AgentDumpResult,
  type AgentClientOptions,
} from 'njava-agent';

export {
  AgentClient,
  createAgentClient,
  evalAgent,
  dumpAgent,
  type AgentStatus,
  type AgentEvalResult,
  type AgentDumpOptions,
  type AgentDumpResult,
  type AgentClientOptions,
};

import { getDaemonState } from './remote/client.js';

if (typeof (globalThis as any).print === 'undefined') {
  (globalThis as any).print = console.log;
}

let _cachedJavaContext: any = null;

function resolveAgentPort(): number {
  if (process.env.EXOPROC_AGENT_PORT) {
    return parseInt(process.env.EXOPROC_AGENT_PORT, 10);
  }
  if (process.env.NJAVA_AGENT_PORT) {
    return parseInt(process.env.NJAVA_AGENT_PORT, 10);
  }
  const state = getDaemonState();
  if (state?.agentPort) {
    return state.agentPort;
  }
  return 43378;
}

export function getActiveJava(options?: { host?: string; port?: number }): any {
  if (_cachedJavaContext && !options) return _cachedJavaContext;
  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? resolveAgentPort();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAgentContext } = require('bun-njava');
    if (typeof createAgentContext === 'function') {
      const ctx = createAgentContext({ host, port, sync: true });
      if (!options) _cachedJavaContext = ctx;
      return ctx;
    }
  } catch {}
  const client = new AgentClient({ host, port });
  if (!options) _cachedJavaContext = client;
  return client;
}

export const Java: any = new Proxy(
  {},
  {
    get(_target, prop) {
      const ctx = getActiveJava();
      const val = ctx[prop];
      if (typeof val === 'function') {
        return val.bind(ctx);
      }
      return val;
    },
    apply(_target, _thisArg, args) {
      const ctx = getActiveJava();
      return (ctx as any)(...args);
    },
  },
);
