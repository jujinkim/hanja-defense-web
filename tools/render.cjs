'use strict';
// Shared by the local game packager and the standalone Pages site build.
function render(template, stores, prefix) {
  const hosts = {app_store:'apps.apple.com', google_play:'play.google.com'};
  if (!stores || Array.isArray(stores) || typeof stores !== 'object' ||
      Object.keys(stores).sort().join(',') !== Object.keys(hosts).sort().join(',')) {
    throw new Error('Unexpected store configuration');
  }
  for (const [name, value] of Object.entries(stores)) {
    if (value === null) continue;
    if (typeof value !== 'string') throw new Error('Store links must be HTTPS URLs or null');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== hosts[name] || url.username || url.password || url.port) {
      throw new Error('Store links must point to the official HTTPS store');
    }
  }
  if (!/^assets\/[A-Za-z0-9._-]+$/.test(prefix)) throw new Error('Invalid game asset prefix');
  if (!template.includes('__ASSET_PREFIX__') || !template.includes('__STORES_JSON__')) {
    throw new Error('Missing landing page asset/store placeholders');
  }
  const json = '{' + Object.keys(stores).sort().map(key => JSON.stringify(key) + ': ' + JSON.stringify(stores[key])).join(', ') + '}';
  return template.replaceAll('__ASSET_PREFIX__', prefix).replaceAll('__STORES_JSON__', json.replaceAll('<', '\\u003c'));
}
module.exports = {render};
if (require.main === module) {
  try {
    const {template, stores, prefix} = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    process.stdout.write(render(template, stores, prefix));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
