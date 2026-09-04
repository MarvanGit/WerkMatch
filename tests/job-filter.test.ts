import assert from 'node:assert/strict';
import test from 'node:test';

import { isTargetStudentTechRole } from '../lib/sources/job-filter.ts';

void test('recognizes technical student roles with product-specific titles', () => {
  for (const title of [
    'Working Student - Data Pipeline Development',
    'Werkstudent Low-Code Development (w/m/div.)',
    'Working Student Power Platform',
    'Werkstudent Schwerpunkt Data Engineering',
  ]) {
    assert.equal(isTargetStudentTechRole({ title }), true, title);
  }
});

void test('does not admit non-technical student roles', () => {
  for (const title of [
    'Working Student Talent Acquisition',
    'Werkstudent Marketing & CRM Support',
    'Working Student Finance',
  ]) {
    assert.equal(isTargetStudentTechRole({ title }), false, title);
  }
});
