# Kanji Tower Defense web demo

This repository owns the introduction, character reference and complete browser package for [kanji.goddinner.com](https://kanji.goddinner.com/). The game is exported locally from [hanja-defense](https://github.com/jujinkim/hanja-defense); Cloudflare renders the website pages and validates the committed package.

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

Commit and push the changed template/config and generated output together. [public/index.html](public/index.html) is generated; direct edits will be replaced. The renderer preserves game assets and generated reference data, and the build verifies their hashes and rejects extra files. The package's initial index hash can differ after an introduction-only edit.

Site titles are **한자타워디펜스**, **漢字タワーディフェンス** and **Kanji Tower Defense** for Korean, Japanese and English/fallback. These labels are separate from the game's save identity.

The header language selector offers 한국어 / 日本語 / English. A valid explicit choice is saved in `hanja-defense.site.locale`; otherwise the introduction follows the browser's language, with English as the unsupported-language fallback. Switching updates text, page metadata and accessible labels in place without reloading the embedded game. Blocked storage still allows switching for the current visit. Website language and the game's saved UI/study languages are independent. The selector remains visible in a second header row on narrow screens, with a 44px control and keyboard focus styling.

## Demo character table

[characters.html](public/characters.html) lists learning characters and supporting parts separately, with the game's Korean/Japanese glyphs, readings, meanings and memory-shape recipes. Separate compact facts identify exact dictionary radicals and available sourced origins; radical membership does not classify historical formation. It has text search and shares the website's language preference. The table is rendered into HTML, remains readable without JavaScript and does not load the game runtime.

Edit [src/characters.html](src/characters.html) only for page layout/translations. **Do not maintain a second character list.** The parent's `tools/package_web.py` reads `data/demo_content.json`, `data/catalog.json`, `data/character_knowledge.json` and source notices from the actual exported `index.pck`, then generates versioned `demo-content.json` and `content-notices.txt` alongside the game. The package verifier compares this projection back to the decoded PCK; missing readings, altered notices or mismatched data fail packaging. Existing review status is retained in the generated data. The 音 entry distinguishes `立 + 日` (memory shapes), `音 · itself a radical`, and `Developed from 言` (sourced origin). No origin is inferred from a recipe. Origin-note language follows the website selector; glyphs/readings retain their study language. Source links and facts render without JavaScript. Both the introduction and reference page keep the short memory-aid/origin distinction visible on mobile.

Every new game package regenerates the reference data automatically. `node tools/build.cjs` renders both website pages from that captured data; it also derives the introduction's character count from it. A template-only edit uses the currently deployed game's data, even if the parent working catalog has moved ahead. No parent checkout or Godot is needed in Cloudflare, and the browser only receives the static table. Keep the generated JSON, notices and HTML in the package inventory.

## Update the game from the parent checkout

Use a clean site checkout and a fresh output folder. Replace `RELEASE` and `FULL_SOURCE_COMMIT` with the intended release label and actual source provenance:

```sh
rtk proxy python3 tools/export.py web-demo
rtk proxy python3 tools/package_web.py --source artifacts/web-demo --output artifacts/releases/RELEASE/public --release RELEASE --commit FULL_SOURCE_COMMIT --update-site
rtk proxy node site/tools/build.cjs
```

The packager validates the candidate, replaces only `public/` and `game-package.json`, removes obsolete public assets and restores the previous package on failure. It does not commit or push. Commit/push the site first, compare remote `main` with its HEAD, then commit/push the parent's changed submodule pointer and compare that remote. Use new commits for recovery; do not force-push.

The synthesis demo uses the same 44 study characters in Korean/Japanese, plus three supporting parts. Its course is “합성 체험 · 한자 44자” / “合成体験 · 漢字44字” / “Synthesis demo · 44 characters”. The introduction and game scope are published in the same site update. The parent versioned `data/demo_content.json` owns the selection; existing curriculum and educational-review metadata remain separate.

The parent [build and publishing guide](https://github.com/jujinkim/hanja-defense/blob/main/docs/BUILD_GUIDE.md#web-publishing) owns export prerequisites, projection, browser checks and diagnostics. `NODE_BIN` or the packager's `--node` selects an alternate Node executable.

## Package integrity and loading

[game-package.json](game-package.json) owns the current release/source identity, version, file inventory and hashes. It describes the committed package, not proof of the latest live deployment. Keep [public/_headers](public/_headers), the versioned binary manifest, decoder license and provenance with the package.

Engine/PCK payloads use application-level Brotli quality 6. The pinned `brotli-dec-wasm` 2.3.0 worker checks encoded/decoded sizes and SHA-256 independently of HTTP transport compression. Do not force `Content-Encoding: br` in `_headers`. No Functions, third-party decoder CDN, hosting credentials or parent Godot source are needed by the build.

The player reports download progress and indeterminate verification/decompression/engine startup. Click-to-start supplies user activation for audio/fullscreen; denial remains usable. The fixed portrait game fits safe insets and uses embedded or dedicated play according to available touch margins. Storage is origin-specific; session-only storage warns about refresh loss.

For site/package changes, select affected build/loader/package tests and bounded browser checks. Documentation-only edits need link and diff checks. Physical mobile/Safari and human playtesting remain unverified where no current evidence exists.

Game and artwork copyrights remain with their owners. Third-party engine, font and data notices ship with the game and credits; this repository adds no game/artwork license grant. Build logs, private keys, credentials and the parent's full catalog stay outside this repository. `.gdignore` excludes the site from parent Godot imports.
