import { readFile } from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';

export async function requirePdfPageCount(path: string, expected: number) {
  const document = await PDFDocument.load(await readFile(path));
  const actual = document.getPageCount();
  if (actual !== expected) {
    throw new Error(
      `The generated cover letter must be exactly ${expected} page${expected === 1 ? '' : 's'}; the compiled PDF has ${actual}.`,
    );
  }
}
