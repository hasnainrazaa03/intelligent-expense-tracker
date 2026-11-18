// The text layer of an uploaded statement PDF, read in a worker thread (S13).
//
// pdf-parse (pdf.js) runs synchronously: in the API process a 600-page
// statement held the event loop for its whole parse (0.6 s on a laptop, several
// seconds on Render's fraction of a CPU), so every other request waited, and a
// crafted PDF could hold it far longer. Here each parse runs in its own worker
// thread, which is killed after PDF_TIMEOUT_MS, can't grow its heap past
// PDF_HEAP_MB, and at most MAX_PARALLEL run at once.
//
// Returns '' when there's no text (a scanned statement), the PDF is broken, or
// the parse is stopped; the route then sends Gemini the PDF itself, as before.
import { Worker } from 'worker_threads';

const PDF_TIMEOUT_MS = Number(process.env.PDF_PARSE_TIMEOUT_MS) > 0 ? Number(process.env.PDF_PARSE_TIMEOUT_MS) : 20_000;
const PDF_HEAP_MB = 192;
const MAX_PARALLEL = 2;
/** The route sends Gemini at most this much text; no need to copy more back. */
export const MAX_PDF_TEXT_CHARS = 200_000;

const PDF_PARSE_PATH = require.resolve('pdf-parse');

// Plain CommonJS, run with `eval: true`, so the same code works under ts-node,
// vitest and the compiled build without a separate worker file to ship.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const { PDFParse } = require(workerData.modulePath);
(async () => {
  const parser = new PDFParse({ data: workerData.data });
  try {
    const { text } = await parser.getText();
    parentPort.postMessage({ text: String(text || '').trim().slice(0, workerData.maxChars) });
  } catch (err) {
    parentPort.postMessage({ error: String((err && err.message) || err) });
  } finally {
    await parser.destroy().catch(() => {});
  }
})();
`;

let running = 0;
const waiting: (() => void)[] = [];
const acquire = (): Promise<void> => {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => { running += 1; resolve(); }));
};
const release = () => {
  running -= 1;
  waiting.shift()?.();
};

const parseInWorker = (pdf: Buffer, timeoutMs: number): Promise<string> =>
  new Promise((resolve) => {
    // A copy with its own ArrayBuffer, handed over to the worker (a Buffer can
    // share Node's pool, which can't be transferred).
    const data = new Uint8Array(pdf);
    let settled = false;
    let worker: Worker;
    const finish = (text: string, problem?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (problem) console.warn(`PDF text extraction: ${problem}; sending the PDF itself instead.`);
      worker?.terminate().catch(() => undefined);
      resolve(text);
    };
    const timer = setTimeout(() => finish('', `stopped after ${timeoutMs} ms`), timeoutMs);
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { modulePath: PDF_PARSE_PATH, data, maxChars: MAX_PDF_TEXT_CHARS },
        transferList: [data.buffer],
        resourceLimits: { maxOldGenerationSizeMb: PDF_HEAP_MB, maxYoungGenerationSizeMb: 32 },
      });
    } catch (err) {
      finish('', `couldn't start a worker (${err instanceof Error ? err.message : err})`);
      return;
    }
    worker.once('message', (m: { text?: unknown; error?: unknown }) =>
      finish(typeof m?.text === 'string' ? m.text : '', m?.error ? `failed (${String(m.error)})` : undefined));
    worker.once('error', (err: Error) => finish('', `failed (${err.message})`));
    worker.once('exit', (code) => finish('', code === 0 ? undefined : `worker exited with code ${code}`));
  });

/** The PDF's text, trimmed and capped at MAX_PDF_TEXT_CHARS; '' if there's none or it can't be read in time. */
export const extractPdfText = async (pdf: Buffer, { timeoutMs = PDF_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<string> => {
  await acquire();
  try {
    return await parseInWorker(pdf, timeoutMs);
  } finally {
    release();
  }
};
