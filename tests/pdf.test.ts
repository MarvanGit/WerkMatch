import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { requirePdfPageCount } from '../lib/documents/pdf.ts';

void test('requires the compiled cover letter to have exactly one page', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'werkmatch-pdf-test-'));
  try {
    const onePage = await PDFDocument.create();
    onePage.addPage();
    const onePagePath = join(directory, 'one-page.pdf');
    await writeFile(onePagePath, await onePage.save());
    await requirePdfPageCount(onePagePath, 1);

    const twoPages = await PDFDocument.create();
    twoPages.addPage();
    twoPages.addPage();
    const twoPagePath = join(directory, 'two-pages.pdf');
    await writeFile(twoPagePath, await twoPages.save());
    await assert.rejects(
      requirePdfPageCount(twoPagePath, 1),
      /compiled PDF has 2/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
