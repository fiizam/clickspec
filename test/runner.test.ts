import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaywrightArgs } from '../src/utils/runner.js';

describe('buildPlaywrightArgs', () => {
  it('should format arguments with --headed by default', () => {
    const args = buildPlaywrightArgs('tests/sample.spec.ts');
    assert.deepEqual(args, ['playwright', 'test', 'tests/sample.spec.ts', '--headed']);
  });

  it('should omit --headed when headless option is true', () => {
    const args = buildPlaywrightArgs('tests/sample.spec.ts', { headless: true });
    assert.deepEqual(args, ['playwright', 'test', 'tests/sample.spec.ts']);
  });

  it('should normalize Windows backslashes to forward slashes', () => {
    const args = buildPlaywrightArgs('tests\\nested\\sample.spec.ts');
    assert.deepEqual(args, ['playwright', 'test', 'tests/nested/sample.spec.ts', '--headed']);
  });
});
