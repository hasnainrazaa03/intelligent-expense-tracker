// Builds small, valid text PDFs for tests (one string per line, one array per page).
const escapePdf = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export const makePdf = (pages: string[][]): Buffer => {
  const bodies: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  };
  const pageIds: number[] = [];
  let next = 4;
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const stream = `BT /F1 9 Tf 40 810 Td 12 TL ${lines.map((l) => `(${escapePdf(l)}) '`).join(' ')} ET`;
    bodies[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    bodies[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  bodies[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < next; i++) {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i} 0 obj\n${bodies[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${next}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};

/** A statement-like PDF of `pages` pages, `lines` transactions each. */
export const statementPdf = (pages: number, lines = 60): Buffer =>
  makePdf(Array.from({ length: pages }, (_, p) =>
    Array.from({ length: lines }, (_, l) => `2026-10-${String((l % 28) + 1).padStart(2, '0')}  CARD PURCHASE MERCHANT ${p}-${l} SAN FRANCISCO CA  ${(l * 3.17).toFixed(2)}`)));
