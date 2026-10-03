// Application-level Brotli decoding keeps Pages' HTTP compression independent.
import init, {DecompressStream, BrotliStreamResultCode} from './brotli/brotli_dec_wasm.js';
self.onmessage = async ({data: {buffer, expectedSize, diagnostics}}) => {
  let stream;
  const timings = [];
  const epoch = diagnostics ? performance.now() : 0;
  let decodedAt = 0;
  try {
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 200 * 1024 * 1024) throw Error('Invalid decoded size');
    await init();
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
    self.postMessage({buffer: output.buffer, timings}, [output.buffer]);
  } catch (error) { self.postMessage({error: String(error.message || error)}); }
  finally { if (stream) stream.free(); }
};
