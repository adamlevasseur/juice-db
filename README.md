# JuiceDB

A lightweight Mac database client for Postgres, MySQL, and SQL Server — built with Electron, React, and TypeScript.

## Requirements

- macOS (arm64)
- Node.js 20+
- npm

## Running locally

Install dependencies, then start the app in dev mode:

```bash
npm install
npm run dev
```

This launches `electron-vite dev`, which starts the renderer with hot-reload and boots the Electron main process.

> **Note:** The `electron` npm package (v42.2.0) doesn't ship a `postinstall` script, so `npm install` alone won't download the actual Electron binary. If `npm run dev` fails with `Error: Electron uninstall`, run:
> ```bash
> node node_modules/electron/install.js
> ```
> then try `npm run dev` again.

Other useful scripts:

```bash
npm run typecheck   # Type-check main + renderer without emitting
npm run build        # Production build via electron-vite (output in out/)
npm run preview      # Preview the production build
```

## Packaging

To build a distributable `.app`:

```bash
npm run package
```

This runs `electron-vite build` followed by `electron-builder --dir`, producing an unpacked app at `release/mac-arm64/JuiceDB.app`.

To build and immediately launch the packaged app in one step:

```bash
npm run run:app
```

### About the afterPack step

Packaging runs `scripts/afterPack.js` automatically, which:

1. Recomputes the `ElectronAsarIntegrity` hash in `Info.plist` — electron-builder 26.x writes this hash before `node_modules` is added, so without this fix the built app fails Electron's startup integrity check and exits silently.
2. Re-signs the app ad-hoc (`codesign --sign -`) with hardened runtime and the JIT entitlement required on modern macOS.

### Gatekeeper on first launch

The app is currently signed **ad-hoc**, not with a Developer ID Application certificate. macOS Gatekeeper will block ad-hoc signed apps from opening via double-click or `open`, usually with no visible error. To run the packaged app:

- Right-click `JuiceDB.app` in Finder → **Open** → confirm **Open Anyway**, or
- Go to **System Settings → Privacy & Security** and click **Open Anyway** after a blocked launch attempt, or
- Temporarily disable Gatekeeper: `sudo spctl --master-disable` (re-enable afterward with `sudo spctl --master-enable`)

To distribute the app without requiring these workarounds, sign with a **Developer ID Application** certificate (not App Store Distribution) and notarize the build, then set `build.mac.identity` in [package.json](package.json) to that identity instead of `null`.
