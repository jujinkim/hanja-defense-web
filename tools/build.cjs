'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {render} = require('./render.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const BUDGET = 20_000_000;

function build(root = path.resolve(__dirname, '..')) {
  const publicRoot = path.join(root, 'public');
  const report = JSON.parse(fs.readFileSync(path.join(root, 'game-package.json'), 'utf8'));
  if (report.schema !== 4 || report.player !== 'play.html' || report.compression.encoding !== 'br' || report.compression.quality !== 6) {
    throw new Error('Unsupported game package');
  }
  const prefix = path.posix.dirname(report.manifest);
  const html = render(fs.readFileSync(path.join(root, 'src/landing.html'), 'utf8'),
    JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8')), prefix);
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const name = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in public package');
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(path.relative(publicRoot, name).split(path.sep).join('/'));
      else throw new Error('Unexpected public file type');
    }
  }
  walk(publicRoot);
  if (files.sort().join('\n') !== Object.keys(report.public_files).sort().join('\n')) {
    throw new Error('Public file allowlist mismatch');
  }
  let bytes = 0;
  for (const name of files) {
    // The template owns index.html; all game files must match the local build.
    const data = name === 'index.html' ? Buffer.from(html) : fs.readFileSync(path.join(publicRoot, name));
    if (name !== 'index.html') {
      const expected = report.public_files[name];
      if (data.length !== expected.bytes || sha(data) !== expected.sha256) throw new Error('Game file integrity failure: ' + name);
    }
    if (data.length > 25 * 1024 * 1024) throw new Error('Pages file limit exceeded');
    bytes += data.length;
  }
  if (files.length > 20000 || bytes > BUDGET) throw new Error('Web demo exceeds the 20 MB public package budget');
  // Validation finishes before changing the previously rendered page.
  const target = path.join(publicRoot, 'index.html');
  if (fs.readFileSync(target, 'utf8') !== html) {
    fs.writeFileSync(target + '.new', html);
    fs.renameSync(target + '.new', target);
  }
  return {publicFiles:files.length, publicBytes:bytes, budgetBytes:BUDGET, gameVersion:report.version};
}
module.exports = {build};
if (require.main === module) {
  try { console.log(JSON.stringify(build())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
