# Kanji Tower Defense web demo

This repository owns the introduction and complete browser package for [kanji.goddinner.com](https://kanji.goddinner.com/). The game is exported locally from [hanja-defense](https://github.com/jujinkim/hanja-defense); Cloudflare renders the introduction and validates the committed package.

## Cloudflare Pages configuration

| Setting | Value |
| --- | --- |
| Repository | `jujinkim/hanja-defense-web` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `node tools/build.cjs` |
| Build output directory | `public` |

The build needs no dependency install or secret. It checks the **20,000,000-byte combined site/game limit**; there is no loading-time acceptance target. Pushes to `main` trigger Git-connected Pages delivery. Verify the served package before claiming a public update is complete.

## Edit the introduction

Edit [src/landing.html](src/landing.html) for layout/translations and [site.json](site.json) for official store links (`null` means coming soon). From this repository run:

```sh
rtk proxy node tools/build.cjs
rtk proxy node --test tools/build.test.cjs
```

Commit and push the changed template/config and generated output together. [public/index.html](public/index.html) is generated; direct edits will be replaced. The renderer preserves game assets, and the build verifies their hashes and rejects extra files. The package's initial index hash can differ after an introduction-only edit.

Site titles are **한자타워디펜스**, **漢字タワーディフェンス** and **Kanji Tower Defense** for Korean, Japanese and English/fallback. These labels are separate from the game's save identity.

## Update the game from the parent checkout

Use a clean site checkout and a fresh output folder. Replace `RELEASE` and `FULL_SOURCE_COMMIT` with the intended release label and actual source provenance:

```sh
rtk proxy python3 tools/export.py web-demo
rtk proxy python3 tools/package_web.py --source artifacts/web-demo --output artifacts/releases/RELEASE/public --release RELEASE --commit FULL_SOURCE_COMMIT --update-site
rtk proxy node site/tools/build.cjs
```

The packager validates the candidate, replaces only `public/` and `game-package.json`, removes obsolete public assets and restores the previous package on failure. It does not commit or push. Commit/push the site first, compare remote `main` with its HEAD, then commit/push the parent's changed submodule pointer and compare that remote. Use new commits for recovery; do not force-push.

The parent [build and publishing guide](https://github.com/jujinkim/hanja-defense/blob/main/docs/BUILD_GUIDE.md#web-publishing) owns export prerequisites, projection, browser checks and diagnostics. `NODE_BIN` or the packager's `--node` selects an alternate Node executable.

## Package integrity and loading

[game-package.json](game-package.json) owns the current release/source identity, version, file inventory and hashes. It describes the committed package, not proof of the latest live deployment. Keep [public/_headers](public/_headers), the versioned binary manifest, decoder license and provenance with the package.

Engine/PCK payloads use application-level Brotli quality 6. The pinned `brotli-dec-wasm` 2.3.0 worker checks encoded/decoded sizes and SHA-256 independently of HTTP transport compression. Do not force `Content-Encoding: br` in `_headers`. No Functions, third-party decoder CDN, hosting credentials or parent Godot source are needed by the build.

The player reports download progress and indeterminate verification/decompression/engine startup. Click-to-start supplies user activation for audio/fullscreen; denial remains usable. The fixed portrait game fits safe insets and uses embedded or dedicated play according to available touch margins. Storage is origin-specific; session-only storage warns about refresh loss.

For site/package changes, select affected build/loader/package tests and bounded browser checks. Documentation-only edits need link and diff checks. Physical mobile/Safari and human playtesting remain unverified where no current evidence exists.

Game and artwork copyrights remain with their owners. Third-party engine, font and data notices ship with the game and credits; this repository adds no game/artwork license grant. Build logs, private keys, credentials and the parent's full catalog stay outside this repository. `.gdignore` excludes the site from parent Godot imports.
