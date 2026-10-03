// Application-level Brotli decoding keeps Pages' HTTP compression independent.
import init, {DecompressStream, BrotliStreamResultCode} from './brotli/brotli_dec_wasm.js';
let initialization;
self.onmessage = async ({data: {id, kind, buffer, expectedSize, diagnostics}}) => {
  let stream, response;
  const timings = [];
  const epoch = diagnostics ? performance.now() : 0;
  let decodedAt = 0;
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || !['pack', 'engine'].includes(kind)) throw Error('Invalid decode request');
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= 0 || buffer.byteLength > 20000000) throw Error('Invalid encoded size');
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 200 * 1024 * 1024) throw Error('Invalid decoded size');
    await (initialization ||= init());
    if (diagnostics) { decodedAt = performance.now(); timings.push({name:"worker.init", start:0, end:decodedAt-epoch}); }
    stream = new DecompressStream();
    const input = new Uint8Array(buffer), output = new Uint8Array(expectedSize);
    let consumed = 0, written = 0;
    for (;;) {
      const result = stream.decompress(input.subarray(consumed), Math.min(1024 * 1024, expectedSize - written + 1));
      let code, chunk, used;
      try { code = result.code; chunk = result.buf; used = result.input_offset; }
      finally { result.free(); }
      if (written + chunk.length > expectedSize) throw Error('Unexpected decoded size');
      output.set(chunk, written); written += chunk.length; consumed += used;
      if (code === BrotliStreamResultCode.ResultSuccess) break;
      if (code !== BrotliStreamResultCode.NeedsMoreOutput || (!used && !chunk.length)) throw Error('Incomplete Brotli data');
    }
    if (consumed !== input.length || written !== expectedSize) throw Error('Unexpected decoded size');
    if (diagnostics) timings.push({name:"worker.decode", start:decodedAt-epoch, end:performance.now()-epoch});
    if (kind === 'engine') {
      self.postMessage({id, kind, stage:'validate'});
      const validationAt = diagnostics ? performance.now() : 0;
      // Godot instantiation failures may not reject: preflight before returning WASM.
      const valid = WebAssembly.validate(output);
      if (diagnostics) timings.push({name:'worker.wasm.validate', start:validationAt-epoch, end:performance.now()-epoch});
      if (!valid) throw Error('Invalid WebAssembly module');
    }
    response = {id, kind, buffer: output.buffer, timings};
  } catch (error) { response = {id, kind, error: String(error.message || error), timings}; }
  finally { if (stream) stream.free(); }
  self.postMessage(response, response.buffer ? [response.buffer] : []);
};
