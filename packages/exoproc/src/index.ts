export * from 'bun-winapi';
export * from 'bun-xffi';
export * from 'exoproc-accessors';
export * from 'bun-nthread';
export * from 'bun-nhook';
export * from 'bun-minhook';
export * from 'bun-nshm';
export * from 'bun-capstone';
export * from 'exoproc-utils';

// Disambiguate duplicate errors between bun-nhook and bun-minhook
export { HookAlreadyEnabledError, HookNotEnabledError } from 'bun-minhook';

// Disambiguate HostAccessor: canonical home is bun-xffi, exoproc-accessors
// only re-exports it for its own package's backward-compat surface.
export { HostAccessor } from 'bun-xffi';
