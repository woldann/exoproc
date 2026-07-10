# Contributing to Exoproc

Thank you for your interest in contributing to Exoproc! This guide will help you set up your development environment, understand the project architecture, and submit contributions.

---

## 1. Prerequisites & Development Setup

Exoproc is a monorepo built using **Bun workspaces**. It targets Windows x64 environments but can be developed on Linux using a Wine emulation layer.

### System Requirements

- **Bun version 1.3.0+** (Bun 1.2.x has an FFI registration limit bug that can cause crashes).
- **Windows x64** or **Linux with Wine x64** (Wine 8.0+ recommended).

### Initializing the Repository

1. Clone the repository.
2. Run installation:
   ```bash
   bun install
   ```
   _Note: This automatically triggers a post-install hook to download required native Windows dependencies (like Capstone DLLs)._

---

## 2. Emulation Environment (Linux Hosts)

Since the library targets Windows FFI, you must run tests and scripts that invoke FFI using Wine. A wrapper script `./bun-wine` is provided in the root.

### Environment Variable Setup

By default, the `./bun-wine` script expects the Windows Bun binary to be located at `~/Downloads/bun-windows-x64/bun.exe`. You can customize this by setting `BUN_WIN_DIR`:

```bash
BUN_WIN_DIR=/path/to/bun-windows-x64 ./bun-wine test
```

### Running Tests

- **All tests**:
  ```bash
  ./bun-wine test
  ```
- **Single test file**:
  ```bash
  ./bun-wine test tests/xffi/stub.test.ts
  ```

---

## 3. Coding & Quality Standards

### Linting & Formatting

We enforce ESLint rules and Prettier formatting.

```bash
bun run lint      # Run ESLint check
bun run lint:fix  # Automatically fix linting issues
bun run format    # Format all files with Prettier
```

### TypeScript Type-Checking

The root `tsconfig.json` acts as a compiler reference holder. To run a full type check across all source files and tests, run:

```bash
bun run typecheck
```

### Commit Guidelines

We use Conventional Commits. A Husky pre-commit hook runs on all commits. Ensure your commit messages follow conventional formats (e.g., `feat(nhook): add instruction simulation`, `fix(nthread): resolve alignment offset`).
