// A stand-in for the Gemini REST API, for end-to-end tests: every
// generateContent call gets the same short reply, so CI never calls (or pays
// for) the real API. Point the server at it with GEMINI_BASE_URL.
//
//   node scripts/mock-gemini.mjs [port]      (default 3999)
import http from 'http';

const port = Number(process.argv[2]) || 3999;
const REPLY = 'Mock analyst reply: your spending is on track this month.';

http
  .createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (!req.url.includes(':generateContent')) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: REPLY }] }, finishReason: 'STOP', index: 0 }] }));
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`mock Gemini on http://127.0.0.1:${port}`));
