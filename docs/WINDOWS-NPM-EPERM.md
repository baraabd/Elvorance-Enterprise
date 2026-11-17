# Fixing npm EPERM on Windows (Elvorance)

The `npm ci` failure `EPERM unlink node_modules/@esbuild/win32-x64/esbuild.exe` indicates that Windows prevented npm from replacing the executable. This is a **local file lock / access restriction**, not a TypeScript compiler error. The subsequent `tsc is not recognized` usually follows because dependency installation was interrupted.

## Safe process

1. Save any local source changes, and stop development servers, running tests, VS Code terminals, and other processes using this checkout.
2. Open PowerShell in `C:\Mobile_Apps\Elvorance-Enterprise`.
3. Inspect project-owned Node and esbuild processes:

```powershell
.\tooling\windows\repair-npm-install.ps1
```

If the script reports project-owned processes, close those applications. To stop *only* those verified processes and retry a clean installation:

```powershell
.\tooling\windows\repair-npm-install.ps1 -StopProjectProcesses -CleanNodeModules -Install
```

The switches are explicit: without them the script only inspects. It does **not** kill every `node.exe` process, delete source files, reset Git, alter Git branches, or touch PostgreSQL volumes.

If deletion still returns EPERM, restart Windows and retry before launching an editor. Review Windows Security protection history and enterprise endpoint protection policies if the lock persists. Do not disable security software broadly. A manual alternative is to stop project processes, remove only `node_modules`, run `npm.cmd ci`, and then `npm.cmd run verify`.

**Important:** `tests/design-parity/artifacts/latest-results.json` may be modified when you run tests. Inspect or stash that source-controlled artifact before switching branches; npm repair must not discard it.

The accepted Node version is 24.x (minimum 24.15) with npm 11.x as specified in the root manifest.
