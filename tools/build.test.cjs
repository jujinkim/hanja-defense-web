'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {build} = require('./build.cjs');
const {render} = require('./render.cjs');
const template = '<img src="__ASSET_PREFIX__/index.icon.png"><script>const stores=__STORES_JSON__;</script>';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hanja-site-test-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'public/assets/demo'), {recursive:true});
  fs.writeFileSync(path.join(root, 'src/landing.html'), template);
  fs.writeFileSync(path.join(root, 'site.json'), JSON.stringify({app_store:null,google_play:null}));
  const files = {'index.html':'previous landing', 'play.html':'game', 'assets/demo/manifest.json':'{}', 'assets/demo/index.wasm.br':'compressed fixture'};
  const report = {schema:5,player:'play.html',compression:{encoding:'br',quality:6,delivery:'application'},manifest:'assets/demo/manifest.json',version:'test',public_files:{}};
  for (const [name, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, 'public', name), bytes);
    report.public_files[name] = {bytes:Buffer.byteLength(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  fs.writeFileSync(path.join(root, 'game-package.json'), JSON.stringify(report));
  return root;
}
test('site-only edits render against the existing game without changing binaries', t => {
  const root = fixture(t);
  const binary = path.join(root, 'public/assets/demo/index.wasm.br');
  const before = fs.readFileSync(binary);
  build(root);
  fs.writeFileSync(path.join(root, 'src/landing.html'), '<h1>Updated</h1>' + template);
  const report = build(root);
  assert.match(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'), /Updated/);
  assert.deepEqual(fs.readFileSync(binary), before);
  assert.equal(report.publicFiles, 4);
});
test('extra or changed game files block rendering and preserve the last page', t => {
  const root = fixture(t);
  const target = path.join(root, 'public/index.html');
  fs.writeFileSync(path.join(root, 'public/key.pem'), 'must not publish');
  assert.throws(() => build(root), /allowlist/);
  fs.unlinkSync(path.join(root, 'public/key.pem'));
  fs.writeFileSync(path.join(root, 'public/play.html'), 'changed game');
  assert.throws(() => build(root), /integrity/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'previous landing');
});
test('the total site and game budget is checked before rendering', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src/landing.html'), 'x'.repeat(20_000_000) + template);
  assert.throws(() => build(root), /20 MB/);
  assert.equal(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'), 'previous landing');
});
test('store links use official HTTPS destinations and cannot escape the script', () => {
  for (const value of ['javascript:alert(1)', 'https://apps.apple.com@evil.test/', 42]) {
    assert.throws(() => render(template, {app_store:value,google_play:null}, 'assets/demo'));
  }
  const html = render(template, {app_store:'https://apps.apple.com/app/id123?x=</script>',google_play:null}, 'assets/demo');
  assert(html.includes('\\u003c/script>'));
  assert.equal(html.match(/<\/script>/g).length, 1);
});
