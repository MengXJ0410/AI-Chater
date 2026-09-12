# AIRI Stage Web integration

This directory owns the pinned AIRI version and the small Companion bridge. The AIRI repository itself is checked out under `.runtime/airi` and is intentionally not committed to AI Chater.

## Local development

Requirements: Node.js 24+, Corepack, and Git. The script reads AIRI's `packageManager` field and uses Corepack to run the pinned `pnpm@10.33.0`; the globally installed pnpm version is not used.

From the AI Chater root:

```powershell
powershell -ExecutionPolicy Bypass -File .\integrations\airi\scripts\start-stage-web.ps1
```

`VERSION` contains both the release tag and the immutable commit. The script fetches and verifies that exact commit, checks port `5173`, installs AIRI's workspace dependencies, copies the bridge, applies the tracked entrypoint patch, and starts `@proj-airi/stage-web`.

If Corepack cannot provide `pnpm@10.33.0`, fix Corepack/network access before continuing. AIRI v0.11.3's published MediaPipe package already contains the export-map change represented by its original patch, but its lockfile still declares that obsolete patch. The startup script removes only that reviewed stale metadata and validates the expected lockfile markers. If those markers no longer match, stop and review the upstream package; do not bypass it with `--ignore-patches`.

For Windows environments with a locally trusted enterprise certificate, the script passes Node's `--use-system-ca` flag only to AIRI subprocesses. It does not disable TLS verification. The Stage Web-only install uses `--ignore-scripts` to avoid unrelated desktop/native postinstall downloads; pnpm's lockfile and reviewed compatibility checks still run. A failed install can leave a partially linked `.runtime/airi/node_modules`; use pnpm's `--force` reinstall before retrying rather than skipping the patch.

When the script reports a port conflict, stop the listed process or use another port and update both `AIRI_STAGE_URL` and `COMPANION_RUNTIME_ORIGIN` to the same public runtime origin.

Set `AIRI_STAGE_URL` and `COMPANION_RUNTIME_ORIGIN` when the runtime is served from another origin. The parent `/companion` page sends the one-time launch ticket with `postMessage`; the bridge exchanges it for a short-lived in-memory runtime token.

## Bridge contract

The bridge listens for `ai-chater:companion` messages from the parent window. It exchanges the bootstrap ticket, creates or resumes one Companion conversation, and translates AIRI chat-completion fetches into `POST /api/companion/generate`. API keys never enter AIRI.

Upstream upgrades must re-check the entrypoint import and the provider fetch shape, then update `VERSION`, the patch notes, and the verification record.
