# XeniOS Game Compatibility

Public compatibility tracking for XeniOS lives here.

This repository owns:

- compatibility issues and issue templates
- canonical `data/compatibility.json`
- canonical `data/discussions.json`
- compatibility screenshots stored under `public/compatibility/screenshots/`

The public website at [xenios.jp](https://xenios.jp) mirrors the JSON snapshots from this repo and builds from local committed data only.

## Data flow

1. Users submit compatibility reports through the app, Discord, or this repo's issue form.
2. Reports are written to GitHub issues in this repo.
3. Workflows rebuild the canonical JSON snapshots.
4. The website repo mirrors those snapshots for offline, deterministic site builds.

## Build identity

Reports may include structured build metadata:

- `buildId`
- `channel` (`release`, `preview`, `self-built`)
- `official`
- `appVersion`
- `buildNumber`
- `commitShort`

Compatibility summaries are derived for:

- `release`
- `preview`
- `all`

The current official release/preview build IDs come from the public website manifest at `xenios-jp/xenios.jp/data/release-builds.json`.

## Local maintenance

Rebuild discussions locally:

```bash
GH_TOKEN="$(gh auth token)" node scripts/build-discussions.mjs
```

Run a full rebuild from issues by dispatching the workflow:

```bash
gh workflow run compat-rebuild.yml -R xenios-jp/game-compatibility
```

## Mirror dispatch

If `WEBSITE_REPO_PAT` is configured in this repo's GitHub Actions secrets, compatibility workflows will send a `repository_dispatch` event to `xenios-jp/xenios.jp` after updating canonical data.
