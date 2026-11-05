import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildPlaywrightArgs, findTestFiles } from '../src/utils/runner.js';

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

describe('findTestFiles', () => {
  it('should discover all spec files in tests directory', async () => {
    const testsDir = path.resolve(process.cwd(), 'tests');
    const files = await findTestFiles(testsDir);
    assert.ok(files.length >= 1);
    assert.ok(files.some((f) => f.includes('porto')));
  });

  it('should return empty array for non-existent directory', async () => {
    const files = await findTestFiles(path.resolve(process.cwd(), 'non-existent-folder-123'));
    assert.deepEqual(files, []);
  });
});
