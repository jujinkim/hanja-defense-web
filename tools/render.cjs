'use strict';
// Shared by the local game packager and the standalone Pages site build.
function render(template, stores, prefix, content) {
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
  if (template.includes('__TARGET_COUNT__')) {
    if (content?.schema !== 1 || !Array.isArray(content.targets) || !content.targets.length) throw new Error('Missing demo count data');
    template = template.replaceAll('__TARGET_COUNT__', String(content.targets.length));
  }
  return template.replaceAll('__ASSET_PREFIX__', prefix).replaceAll('__STORES_JSON__', json.replaceAll('<', '\\u003c'));
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderCharacters(template, content, prefix) {
  if (!/^assets\/[A-Za-z0-9._-]+$/.test(prefix) || content?.schema !== 1 ||
      !Array.isArray(content.targets) || !Array.isArray(content.materials) || !content.targets.length) {
    throw new Error('Invalid demo reference data');
  }
  const ids = new Set();
  function row(entry) {
    if (ids.has(entry.id)) throw new Error('Duplicate demo identity');
    ids.add(entry.id);
    for (const locale of ['ko','ja']) {
      if (!entry[locale]?.glyph || !entry[locale].meaning || typeof entry[locale].readings !== 'object') throw new Error('Incomplete demo language');
    }
    const readings = (values = []) => values.map(escape).join(' · ') || '—';
    const alternate = entry.ko.glyph === entry.ja.glyph ? '' : `<small lang="ja">${escape(entry.ja.glyph)}</small>`;
    const japanese = (entry.ja.readings.on?.length || entry.ja.readings.kun?.length)
      ? `<span class="reading-label" data-i18n="on">음</span> ${readings(entry.ja.readings.on)}<br><span class="reading-label" data-i18n="kun">훈</span> ${readings(entry.ja.readings.kun)}` : '—';
    return `<tr data-character="${escape(entry.id)}"><th scope="row" class="character"><span lang="ko">${escape(entry.ko.glyph)}</span>${alternate}</th>` +
      `<td lang="ko"><div class="readings">${readings(entry.ko.readings.ko)}</div><p class="meaning">${escape(entry.ko.meaning)}</p></td>` +
      `<td lang="ja"><div class="readings">${japanese}</div><p class="meaning">${escape(entry.ja.meaning)}</p></td></tr>`;
  }
  const replacements = {__ASSET_PREFIX__:prefix, __TARGET_ROWS__:content.targets.map(row).join('\n'),
    __MATERIAL_ROWS__:content.materials.map(row).join('\n'), __TARGET_COUNT__:content.targets.length, __MATERIAL_COUNT__:content.materials.length};
  for (const [marker,value] of Object.entries(replacements)) {
    if (!template.includes(marker)) throw new Error('Missing reference placeholder: ' + marker);
    template = template.replaceAll(marker, String(value));
  }
  return template;
}
module.exports = {render, renderCharacters};
if (require.main === module) {
  try {
    const {template, stores, prefix, content, page} = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    process.stdout.write(page === 'characters' ? renderCharacters(template, content, prefix) : render(template, stores, prefix, content));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
