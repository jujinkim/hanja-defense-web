/* Pages-only adapter; the ordinary Godot ZIP does not load this file. */
(() => {
  'use strict';
  const script = document.currentScript;
  const manifestURL = new URL(script.dataset.manifest, document.baseURI);
  const manifestHash = script.dataset.sha256;
  // Probe failure must never abort download, gameplay or saving.
  const probe = (method, ...args) => { try { return window.HanjaDiagnostics?.[method](...args); } catch (_) { return null; } };
  const measured = async (name, parent, work) => {
    const id = probe('begin', name, parent);
    try { const result = await work(id); probe('end', id); return result; }
    catch (error) { probe('end', id, 'error'); throw error; }
  };
  const MAX_FILE = 200 * 1024 * 1024;
  const MAX_ENCODED_TOTAL = 20000000;
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  async function read(url, expectedSize, expectedHash, progress, verify, parent, kind) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let timing = probe('begin', kind + '.download', parent);
    try {
      const response = await fetch(url, {signal: controller.signal, cache: 'no-cache', credentials: 'same-origin'});
      if (!response.ok) throw Error('Download failed: ' + response.status);
      const reader = response.body.getReader();
      const buffer = new Uint8Array(expectedSize);
      let offset = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        if (offset + value.length > expectedSize) { await reader.cancel(); throw Error('Unexpected download size'); }
        buffer.set(value, offset); offset += value.length;
        if (progress) progress(offset);
      }
      probe('end', timing);
      timing = probe('begin', kind + '.hash.encoded', parent);
      verify();
      if (offset !== expectedSize || await hash(buffer) !== expectedHash) throw Error('Download integrity check failed');
      return buffer;
    } catch (error) { probe('end', timing, 'error'); throw error; }
    finally { probe('end', timing); clearTimeout(timer); }
  }
  async function manifest() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let bytes;
    try {
      const response = await fetch(manifestURL, {cache: 'no-cache', signal: controller.signal});
      if (!response.ok) throw Error('Release manifest unavailable');
      bytes = new Uint8Array(await response.arrayBuffer());
    } finally { clearTimeout(timer); }
    if (bytes.length > 65536 || !validHash(manifestHash) || await hash(bytes) !== manifestHash) throw Error('Release manifest integrity check failed');
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (result.schema !== 4 || result.compression?.encoding !== 'br' || result.compression?.quality !== 6 || result.compression?.delivery !== 'application' || Object.keys(result.files).sort().join() !== 'index.pck,index.wasm') throw Error('Unsupported release manifest');
    let encodedTotal = 0;
    for (const name of ['index.pck', 'index.wasm']) {
      const file = result.files[name];
      if (file.path !== name + '.br' || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > MAX_FILE || !validHash(file.sha256)
          || !Number.isSafeInteger(file.encoded_bytes) || file.encoded_bytes <= 0 || !validHash(file.encoded_sha256)) throw Error('Invalid release file');
      encodedTotal += file.encoded_bytes;
    }
    if (encodedTotal > MAX_ENCODED_TOTAL) throw Error('Web demo download budget exceeded');
    return result;
  }
  function decode(bytes, expectedSize, parent) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('brotli-worker.js', manifestURL), {type:'module'});
      const finish = (error, buffer) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(new Uint8Array(buffer)); };
      const timer = setTimeout(() => finish(Error('Decompression timed out')), 120000);
      worker.onmessage = ({data}) => { probe('worker', data.timings, parent); finish(data.error ? Error(data.error) : null, data.buffer); };
      worker.onerror = () => finish(Error('Could not load the Brotli decoder'));
      worker.postMessage({buffer:bytes.buffer, expectedSize, diagnostics:!!parent}, [bytes.buffer]);
    });
  }
  async function download(file, progress, stage, kind, parent) {
    const bytes = await read(new URL(file.path, manifestURL), file.encoded_bytes, file.encoded_sha256, progress, () => stage('verify-' + kind), parent, kind);
    stage('decompress-' + kind);
    const decoded = await measured(kind + '.decompress', parent, id => decode(bytes, file.bytes, id));
    stage('verify-' + kind);
    await measured(kind + '.hash.decoded', parent, async () => {
      if (decoded.byteLength !== file.bytes || await hash(decoded) !== file.sha256) throw Error('Decoded integrity check failed');
    });
    return decoded;
  }
  window.HanjaPages = Object.freeze({
    async start(config, options) {
      const stage = options.onStage || (() => {});
      stage('manifest');
      return measured('startup', null, async root => {
        const release = await measured('manifest', root, manifest);
        probe('metadata', {version:release.version, manifestHash});
        const packSize = release.files['index.pck'].encoded_bytes;
        const total = packSize + release.files['index.wasm'].encoded_bytes;
        const progress = options.onProgress || (() => {});
        let pack = null, wasm = null, engine = null;
        const originalFetch = window.fetch;
        let adapter = null;
        try {
          stage('download-pack');
          progress(0, total);
          pack = await download(release.files['index.pck'], loaded => progress(loaded, total), stage, 'pack', root);
          stage('download-engine');
          progress(packSize, total);
          wasm = await download(release.files['index.wasm'], loaded => progress(packSize + loaded, total), stage, 'engine', root);
          // Validate before Godot initialization (its instantiation errors may not reject).
          await measured('wasm.validate', root, () => { if (!WebAssembly.validate(wasm)) throw Error('Invalid WebAssembly module'); });
          const wasmURL = new URL(config.executable + '.wasm', document.baseURI).href;
          adapter = function(input, init) {
            const url = new URL(input instanceof Request ? input.url : input, document.baseURI).href;
            if (url === wasmURL) return Promise.resolve(new Response(wasm, {headers: {'Content-Type': 'application/wasm'}}));
            return originalFetch.call(window, input, init);
          };
          window.fetch = adapter;
          stage('prepare-engine');
          // Give the browser a task boundary before potentially expensive WASM initialization.
          await new Promise(resolve => setTimeout(resolve, 0));
          const {onStage, onProgress, ...engineOptions} = options;
          engine = new Engine({...config, ...engineOptions, onProgress: undefined});
          await measured('engine.preloadFile', root, () => engine.preloadFile(pack, 'index.pck'));
          pack = null;
          let timeout;
          try {
            await measured('engine.init', root, () => Promise.race([engine.init(config.executable), new Promise((_, reject) => {
              timeout = setTimeout(() => reject(Error('Engine initialization timed out')), 120000);
            })]));
          } finally { clearTimeout(timeout); }
          window.fetch = originalFetch; wasm = null;
          stage('start-game');
          await new Promise(resolve => setTimeout(resolve, 0));
          await measured('engine.start', root, () => engine.start({...engineOptions, onProgress: undefined, args: ['--main-pack', 'index.pck', ...(config.args || [])]}));
        } finally {
          if (adapter && window.fetch === adapter) window.fetch = originalFetch;
          pack = null; wasm = null; engine = null;
        }
      });
    }
  });
})();
