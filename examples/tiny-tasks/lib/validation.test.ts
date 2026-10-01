import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTitle } from './validation.ts';

// Small, executable checks for the source-reading tutorial.
test('normalizes a title before saving', () => {
  assert.equal(validateTitle('  Read the code  '), 'Read the code');
});

test('rejects blank and non-string input', () => {
  for (const value of ['', '   ', null, 42]) {
    assert.throws(() => validateTitle(value), /needs a title/);
  }
});

test('keeps the documented length boundary', () => {
  assert.equal(validateTitle('x'.repeat(120)).length, 120);
  assert.throws(() => validateTitle('x'.repeat(121)), /under 121/);
});
