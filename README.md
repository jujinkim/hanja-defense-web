# Kanji Tower Defense web demo

The introduction page and complete browser game are deployed together to **one Cloudflare Pages project**. Godot runs in the centered iframe. The game is built locally in [hanja-defense](https://github.com/jujinkim/hanja-defense); Cloudflare does not build Godot or recompress the game.

## Cloudflare Pages setup

Connect **jujinkim/hanja-defense-web** using Pages' Git integration:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `node tools/build.cjs` |
| Build output directory | `public` |

No dependency install or secret is required by the build. It renders the introduction, verifies the committed game files and checks the **20,000,000-byte combined site/game limit**. There is no loading-time acceptance target. The current 13-file package is 16,426,191 bytes. Whole engine/PCK files use Brotli quality 6; `public/_headers` must be preserved for browser-native decoding.

The connected site is live at **https://kanji.goddinner.com/**. Pushes to `main` deploy the committed introduction and game together through Cloudflare Pages. The WEB-LOAD push was verified against the public HTML before this naming update. [Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## Editing the introduction

- Edit `src/landing.html` for the Korean/Japanese/English introduction and layout.
- Edit `site.json` for official App Store/Google Play URLs. `null` displays coming soon.
- Run `node tools/build.cjs`, then commit/push this repository.
- When working in the parent game's `site/` folder, also commit/push the updated submodule pointer in the parent repository.

The renderer leaves all game files unchanged. `public/index.html` is generated from the template; edit the template so the next build preserves your change. `game-package.json` records the last locally verified game package; its initial index hash is historical after a website-only edit, while all other file hashes remain enforced.

## Updating the game

From the parent game checkout, build the web export locally, then package into a fresh artifact folder with `tools/package_web.py --update-site`. Use a clean site checkout so this operation cannot overwrite uncommitted edits. The command verifies the package and replaces only `public/` and `game-package.json`; it never commits or pushes. It preserves the authoring files and removes obsolete game assets from the active public folder.

Example from the parent (supply the current complete game commit SHA and a new release label/output path):

```sh
rtk proxy python3 tools/export.py web-demo
rtk proxy python3 tools/package_web.py --source artifacts/web-demo --output artifacts/site-update-v0.1.1/public --release web-demo-v0.1.1 --commit <GAME_COMMIT_SHA> --update-site
rtk proxy node site/tools/build.cjs
rtk proxy git -C site add public game-package.json
rtk proxy git -C site commit -m 'Update the web demo game'
rtk proxy git -C site push origin main
rtk proxy git add site
rtk proxy git commit -m 'Update the web demo site revision'
rtk proxy git push origin main
```

Set `NODE_BIN` or pass the packager's `--node` if Node is not on PATH. After relevant local checks, commit/push the site first so the parent's submodule reference is remotely available. The parent game source, full paid catalog, build logs, local TLS keys and credentials do not belong in this repository. `.gdignore` prevents the website/binaries from being imported into the parent Godot project.

## Verification and provenance

`node --test tools/build.test.cjs` covers website-only updates, game integrity, extra-file rejection, the combined budget and safe official store links. The parent packager also validates encoded/decoded binary hashes, source notices and the exact public allowlist as part of its existing build/audit process.

The initial public folder is byte-for-byte the accepted WEB-LANDING candidate, including its unchanged audited WEB-10R game runtime. See the parent repository's `docs/evidence/WEB-LANDING.json` and `docs/evidence/WEB-LAN.json`. Package metadata records the original working-tree provenance; it is not a newly exported or tagged game release. Earlier browser startup/audio/fullscreen/layout evidence is retained. Physical mobile/Safari and human playtesting remain unverified.

Game and artwork copyrights remain with their respective owners. Third-party engine, font and data notices are included in the game distribution and credits; this repository adds no license grant for the game or artwork.

## Loading feedback

The player shows localized download percentage, file verification, engine preparation and game startup. Percentage tracks decoded game/engine bytes; the browser handles Brotli decoding while receiving data. Initialization uses an indeterminate indicator. The update preserves the audited game payload. Loader9/package8/site4 tests and a bounded Chrome loading-to-boot check pass; physical mobile/Safari and human playtesting remain unverified.

## Localized site name

The landing page, metadata, footer, iframe title and player shell use **한자타워디펜스** in Korean, **漢字タワーディフェンス** in Japanese and **Kanji Tower Defense** in English and fallback locales. No parenthesized English is added. This is website wording; the existing Godot game payload and save identity remain unchanged. Site build/tests pass, with Chrome name/overflow checks for Korean/Japanese/English and French fallback, plus inspected Korean narrow and English desktop captures.
