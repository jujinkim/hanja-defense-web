/* Pages-only adapter; the ordinary Godot ZIP does not load this file. */
(() => {
  'use strict';
  const script = document.currentScript;
  const manifestURL = new URL(script.dataset.manifest, document.baseURI);
  const manifestHash = script.dataset.sha256;
  const MAX_FILE = 200 * 1024 * 1024;
  const MAX_ENCODED_TOTAL = 20000000;
  const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  async function read(url, expectedSize, expectedHash, progress, verify) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, {signal: controller.signal, cache: 'no-cache', credentials: 'same-origin'});
      if (!response.ok) throw Error('Download failed: ' + response.status);
      if (response.headers.get('content-encoding') !== 'br') throw Error('Missing Brotli response encoding');
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
      verify();
      if (offset !== expectedSize || await hash(buffer) !== expectedHash) throw Error('Download integrity check failed');
      return buffer;
    } finally { clearTimeout(timer); }
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
    if (result.schema !== 3 || result.compression?.encoding !== 'br' || result.compression?.quality !== 6 || Object.keys(result.files).sort().join() !== 'index.pck,index.wasm') throw Error('Unsupported release manifest');
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
  async function download(file, progress, verify) {
    return read(new URL(file.path, manifestURL), file.bytes, file.sha256, progress, verify);
  }
  window.HanjaPages = Object.freeze({
    async start(config, options) {
      const stage = options.onStage || (() => {});
      stage('manifest');
      const release = await manifest();
      const total = release.files['index.pck'].bytes + release.files['index.wasm'].bytes;
      const progress = options.onProgress || (() => {});
      let pack = null, wasm = null, engine = null;
      const originalFetch = window.fetch;
      let adapter = null;
      try {
        stage('download-pack');
        progress(0, total);
        pack = await download(release.files['index.pck'], loaded => progress(loaded, total), () => stage('verify-pack'));
        stage('download-engine');
        progress(pack.byteLength, total);
        wasm = await download(release.files['index.wasm'], loaded => progress(pack.byteLength + loaded, total), () => stage('verify-engine'));
        // Validate before Godot initialization (its instantiation errors may not reject).
        if (!WebAssembly.validate(wasm)) throw Error('Invalid WebAssembly module');
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
        await engine.preloadFile(pack, 'index.pck');
        pack = null;
        let timeout;
        try {
          await Promise.race([engine.init(config.executable), new Promise((_, reject) => {
            timeout = setTimeout(() => reject(Error('Engine initialization timed out')), 120000);
          })]);
        } finally { clearTimeout(timeout); }
        window.fetch = originalFetch; wasm = null;
        stage('start-game');
        await new Promise(resolve => setTimeout(resolve, 0));
        await engine.start({...engineOptions, onProgress: undefined, args: ['--main-pack', 'index.pck', ...(config.args || [])]});
      } finally {
        if (adapter && window.fetch === adapter) window.fetch = originalFetch;
        pack = null; wasm = null; engine = null;
      }
    }
  });
})();
