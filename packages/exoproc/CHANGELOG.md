# exoproc

## 0.4.0

### Minor Changes

- Multi-package ecosystem release: un-privated all modular packages (`bun-njava`, `bun-winapi`, `bun-xffi`, `exoproc-accessors`, `exoproc-mappings`, `exoproc-minecraft`, `exoproc-utils`, etc.) for public package publishing.
- Added in-process Java Agent hot-upgrade mechanism via `exoproc upgrade-agent` (`upgrade`) to inject and execute compiled bytecode into running targets.
- Removed legacy daemon requirement in favor of direct cache-backed sessions and active agent slot routing.
- Fixed `exoproc-mappings` dependency and project reference resolution across `bun-njava` and TypeScript monorepo builds.
- Fixed ESM/bundle `__localMemoryAccessor` resolution in `bun-xffi` for reliable cross-process string reading.

## 0.3.1

### Patch Changes

- Dynamic version synchronization across CLI (`exoproc --version`), MCP server, and HTTP API server directly from `package.json`.
- Added `inspect-jar` CLI command (`exoproc inspect-jar <target.jar>`) with visual Ink terminal cards and pure `--json` output.
- Prominent red Ink error card rendering for failed actions and connection errors.
- Cross-runtime compatibility fix for Node.js and Bun path resolution in ECJ and tiny-remapper helpers.

## 0.3.0

### Minor Changes

- Fluent agent builder, visual Ink terminal card dashboard, and native Bun.serve daemon engine.

## 0.2.0

### Minor Changes

- Unified Exoproc CLI runner, background daemon, and cross-platform automation client with Node.js and Bun dual-runtime support, dynamic JVM bytecode reflection, and capability detection.

### Patch Changes

- Updated dependencies
  - exoproc-asm@0.2.0
  - exoproc-jjit@0.2.0
  - exoproc-minecraft@0.2.0
  - njava-agent@0.2.0
  - exoproc-mappings@0.2.0
  - exoproc-utils@0.2.0
