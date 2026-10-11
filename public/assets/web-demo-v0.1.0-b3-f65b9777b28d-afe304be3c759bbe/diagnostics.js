/* Internal, opt-in, memory-only observations. No game state or command API. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('diagnostics') !== '1') return;
  const LIMIT = 4096, MATERIAL_LIMIT = 128, records = [], open = new Map();
  let native = {open:0, materialLimit:MATERIAL_LIMIT, materialDropped:0, materials:{}};
  let active = true, serial = 0, dropped = 0, observer, frameRequest, cancelFrames;
  const metadata = {timeOrigin:performance.timeOrigin, userAgent:navigator.userAgent,
    longTasksSupported:typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask')};
  const put = row => { if (!active) return; if (records.length < LIMIT) records.push(row); else dropped++; };
  const safe = fn => (...args) => { try { return fn(...args); } catch (_) { return null; } };
  const begin = (name, parent = null) => {
    if (!active || open.size >= 64) return null;
    const id = 'j' + (++serial);
    open.set(id, {id, parent, name, start:performance.now(), hidden:document.hidden});
    return id;
  };
  const end = (id, status = 'ok') => {
    const row = open.get(id); if (!row) return;
    open.delete(id); put({...row, end:performance.now(), status, hidden:row.hidden || document.hidden});
  };
  const mark = (name, parent = null) => put({name, parent, start:performance.now(), hidden:document.hidden, type:'mark'});
  const visibility = () => { for (const row of open.values()) row.hidden ||= document.hidden; mark('visibility'); };
  document.addEventListener('visibilitychange', visibility);
  const input = event => { if (event.target?.id === 'canvas') mark('input.' + event.type); };
  document.addEventListener('pointerup', input, true);
  if (metadata.longTasksSupported) {
    try { observer = new PerformanceObserver(list => {
      for (const row of list.getEntries()) put({name:'longtask', start:row.startTime, end:row.startTime + row.duration, hidden:document.hidden});
    }); observer.observe({type:'longtask'}); } catch (_) { metadata.longTasksSupported = false; }
  }
  const api = {
    get active() { return active; },
    begin:safe(begin), end:safe(end), mark:safe(mark),
    metadata:safe(value => Object.assign(metadata, value)),
    // Native ticks remain raw; map each flushed batch to the browser clock using its send tick.
    ingest:safe((rows, sent, lost, state) => {
      if (!active) return;
      if (state) {
        const entries = Object.entries(state.materials || {});
        const valid = entries.filter(([key])=>key.length<=512);
        native = {open:state.open, materialLimit:MATERIAL_LIMIT, materialDropped:state.materialDropped + entries.length-Math.min(valid.length,MATERIAL_LIMIT),
          materials:Object.fromEntries(valid.slice(0,MATERIAL_LIMIT).map(([key,value])=>[key,{...value}]))};
      }
      const offset = performance.now() - sent; dropped += lost;
      for (const row of rows) put({...row, nativeStart:row.start, nativeEnd:row.end,
        start:row.start + offset, end:row.end == null ? undefined : row.end + offset, hidden:document.hidden});
    }),
    afterRender:safe(parent => requestAnimationFrame(() => mark('browser.raf_after_post_draw', parent))),
    worker:safe((rows, parent) => { for (const row of rows || []) put({...row, parent, clock:'worker-relative'}); }),
    frames:safe((warmup = 30, count = 180) => {
      if (!active || frameRequest || !Number.isInteger(warmup) || !Number.isInteger(count) || warmup < 0 || count < 1 || warmup + count > 1000) return null;
      return new Promise(resolve => {
        let previous, index = 0; const samples = [];
        cancelFrames = () => resolve({cancelled:true, samples});
        const tick = now => {
          if (previous !== undefined && index++ >= warmup) {
            const row = {ms:now-previous, hidden:document.hidden}; samples.push(row);
            put({name:'frame.interval', start:previous, end:now, hidden:row.hidden});
          }
          previous = now;
          if (samples.length < count) frameRequest = requestAnimationFrame(tick);
          else { frameRequest = null; cancelFrames = null; resolve({warmup, samples}); }
        };
        frameRequest = requestAnimationFrame(tick);
      });
    }),
    stopFrames:safe(() => {
      if (frameRequest) cancelAnimationFrame(frameRequest);
      if (cancelFrames) cancelFrames();
      frameRequest = null; cancelFrames = null;
    }),
    snapshot:safe(() => ({schema:2, native:JSON.parse(JSON.stringify(native)), metadata:{...metadata}, limit:LIMIT, dropped, open:open.size, records:records.map(row=>({...row}))})),
    finish:safe(() => {
      for (const id of [...open.keys()]) end(id, 'cancelled');
      if (observer) observer.disconnect();
      api.stopFrames();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerup', input, true);
      active = false;
      return JSON.stringify(api.snapshot());
    })
  };
  window.HanjaDiagnostics = Object.freeze(api);
})();
