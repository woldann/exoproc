# Development and testing

Exoproc is a Bun workspace monorepo targeting Windows x64. Linux development can run Windows Bun under Wine through `bun-wine`.

```bash
bun install
bun run build
bun run lint
bun run typecheck
bun test
```

Build and serve the documentation with `bun run docs:dev`; build its static output with `bun run docs:build`.

Derive technical examples from public exports and existing tests. Keep the default factory path separate from direct low-level constructors, and do not document ABI or lifecycle behavior as guaranteed unless the source actually provides that guarantee.
