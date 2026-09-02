import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/dabbir-qa-suite-runner/index.ts', import.meta.url), 'utf8');

test('QA runner accepts only the two authorized main workflows', () => {
  assert.match(source, /dabbir-ai-customer-journey\.yml@refs\/heads\/main/u);
  assert.match(source, /dabbir-owner-away-production\.yml@refs\/heads\/main/u);
  assert.match(source, /GH_WORKFLOWS\.has\(String\(payload\.workflow_ref\|\|''\)\)/u);
  assert.doesNotMatch(source, /workflow_ref\.includes|workflow_ref\.startsWith|\*\.yml/u);
});
