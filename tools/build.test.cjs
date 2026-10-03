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

// Execute the actual landing script: mode must be chosen before an iframe exists.
const vm = require('node:vm');
function landing({width, coarse=true, left=0, right=0, language='ko'}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/landing.html'), 'utf8');
  assert(!/<iframe\b/i.test(source), 'No parser-created game requests');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace('__STORES_JSON__', '{}');
  const listeners = {};
  const node = () => ({style:{},dataset:{},hidden:true,children:[],attributes:new Set(['hidden']),setAttribute(k,v){this[k]=v;},toggleAttribute(k,v){v?this.attributes.add(k):this.attributes.delete(k);},hasAttribute(k){return this.attributes.has(k);},append(n){this.children.push(n);}});
  const ids = Object.fromEntries(['safe-insets','player-host','play','title'].map(id=>[id,node()]));
  const hints = [node(),node()]; hints.forEach(n=>n.dataset.label='scrollHint');
  const links = [node(),node()]; links.forEach(n=>n.href='#play');
  const note = node(), meta=node(), created=[];
  const root = {clientWidth:width};
  const media = {matches:coarse,addEventListener(){}};
  ids['player-host'].getBoundingClientRect = () => {
    const available=root.clientWidth-left-right, width=Math.min(420,available-48);
    return {left:left+(available-width)/2,right:left+(available+width)/2,width};
  };
  const document = {documentElement:root,getElementById:id=>ids[id],
    querySelector:selector=>selector.startsWith('meta')?meta:note,
    querySelectorAll:selector=>({'[data-i18n]':[],'[data-label]':hints,'[data-store]':[],'a[href="#play"]':links,'.scroll-hint':hints}[selector]),
    createElement:tag=>{const n=node();n.tag=tag;created.push(n);return n;}};
  const context = {document,navigator:{language},matchMedia:()=>media,
    getComputedStyle:()=>({paddingLeft:left+'px',paddingRight:right+'px'}),
    ResizeObserver:class {observe(){}},
    window:{addEventListener:(name,fn)=>listeners[name]=fn},console};
  vm.runInNewContext(script,context);
  return {ids,hints,links,created,resize(width){root.clientWidth=width;listeners.resize();}};
}
test('touch-primary safe-width thresholds choose dedicated, hints or plain embed', () => {
  for (const [width,mode,hints] of [[467,'dedicated',false],[468,'embedded',true],[547,'embedded',true],[548,'embedded',false]]) {
    const result=landing({width});
    assert.equal(result.ids.play.dataset.mode,mode);
    assert.equal(result.created.length,mode==='dedicated'?0:1);
    assert(result.hints.every(n=>n.hasAttribute('hidden')===!hints));
    assert(result.links.every(n=>n.href===(mode==='dedicated'?'play.html':'#play')));
    if(mode==='embedded')assert.equal(result.created[0].src,'play.html');
    // The same boundaries apply after subtracting asymmetric safe areas.
    const safe=landing({width:width+50,left:30,right:20});
    assert.equal(safe.ids.play.dataset.mode,mode);
    assert(safe.hints.every(n=>n.hasAttribute('hidden')===!hints));
  }
});
test('desktop stays embedded; resize preserves the initial frame or dedicated mode', () => {
  assert.equal(landing({width:360,coarse:false}).created.length,1);
  assert(landing({width:500,coarse:false}).hints.every(n=>n.hasAttribute('hidden')));
  const embedded=landing({width:500}), frame=embedded.created[0];
  for(const width of [420,900,500]) {
    embedded.resize(width);
    assert.equal(embedded.created.length,1);
    assert.equal(embedded.ids['player-host'].children[0],frame);
    assert(embedded.hints.every(n=>n.hasAttribute('hidden')===(width!==500)));
  }
  const dedicated=landing({width:420});dedicated.resize(900);
  assert.equal(dedicated.created.length,0);
  assert.equal(dedicated.ids.play.dataset.mode,'dedicated');
});
test('scroll guidance is localized, static and leaves touch input to the page', () => {
  const labels=new Set();
  for(const language of ['ko','ja','en','fr']) {
    const result=landing({width:500,language});
    assert(result.hints.every(n=>n['aria-label']?.length>10));
    labels.add(result.hints[0]['aria-label']);
    assert.equal(result.hints[0].style.left,'-20px');
    assert.equal(result.hints[1].style.left,'440px');
  }
  assert.equal(labels.size,3);
  const source=fs.readFileSync(path.join(__dirname,'../src/landing.html'),'utf8');
  assert.match(source,/\.scroll-hint\s*\{[^}]*pointer-events:none/);
  assert(!/touchmove|preventDefault|<animate/.test(source));
});
