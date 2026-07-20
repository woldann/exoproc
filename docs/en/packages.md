# Package map

| Package             | Responsibility                                                                        |
| ------------------- | ------------------------------------------------------------------------------------- |
| `bun-xffi`          | Cross-process FFI foundation: C ABI types, struct/union layout, accessors, TinyCC JIT |
| `bun-winapi`        | Win32 process, thread, module, memory, and context wrappers                           |
| `bun-nthread`       | Runs calls by redirecting an existing target thread                                   |
| `exoproc-accessors` | Middleware chain that connects NThread to memory and call operations                  |
| `bun-nhook`         | Two-byte `EB FE` park-and-simulate inline hooks                                       |
| `bun-minhook`       | Five-byte detour and relocated trampoline hooks                                       |
| `bun-capstone`      | Capstone bindings for instruction decoding                                            |
| `bun-nshm`          | Shared-memory helpers                                                                 |

`exoproc-utils` is the common helper layer. Apart from it, `bun-xffi` is the foundation of the functional stack; `bun-winapi`, NThread, accessors, and hooks build on its cross-process FFI model. For application code, `createAccessor()` from `exoproc` is the simplest entry point.
