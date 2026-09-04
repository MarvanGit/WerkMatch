import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareLatexForTectonic } from '../lib/documents/render.ts';

void test('removes only explicit TeX engine driver options', () => {
  const source = String.raw`\usepackage[pdftex,colorlinks=true]{hyperref}
\usepackage[pdftex]{graphicx}
\usepackage[margin=1in]{geometry}
\begin{document}
Verified CV content
\end{document}`;

  const prepared = prepareLatexForTectonic(source);

  assert.match(prepared, /\\usepackage\[colorlinks=true\]\{hyperref\}/);
  assert.match(prepared, /\\usepackage\{graphicx\}/);
  assert.match(prepared, /\\usepackage\[margin=1in\]\{geometry\}/);
  assert.match(prepared, /Verified CV content/);
  assert.doesNotMatch(prepared, /pdftex/);
});

void test('keeps package declarations without driver options byte-for-byte', () => {
  const source = String.raw`\usepackage[unicode,hidelinks]{hyperref}`;
  assert.equal(prepareLatexForTectonic(source), source);
});
