# exoproc

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
