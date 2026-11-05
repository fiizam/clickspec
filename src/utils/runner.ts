import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { logError } from './logger.js';

export interface ExecuteTestOptions {
  headless?: boolean;
  cwd?: string;
}

export interface TestPickerOptions {
  headless?: boolean;
  all?: boolean;
  cwd?: string;
}

/**
 * Builds normalized cross-platform arguments for `playwright test`.
 * Converts Windows backslashes to forward slashes to ensure Playwright's regex matcher works.
 */
export function buildPlaywrightArgs(specPath: string, options: ExecuteTestOptions = {}): string[] {
  const normalizedPath = specPath.replace(/\\/g, '/');
  const args = ['playwright', 'test', normalizedPath];

  if (!options.headless) {
    args.push('--headed');
  }

  return args;
}

/**
 * Recursively scans a directory for Playwright test files (*.spec.ts, *.spec.js, *.test.ts, *.test.js).
 */
export async function findTestFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await findTestFiles(fullPath);
        results.push(...subFiles);
      } else if (
        entry.isFile() &&
        /\.(spec|test)\.(ts|js)$/i.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }

  return results.sort();
}

/**
 * Executes a Playwright test spec using `npx playwright test`.
 * Handles platform differences (Windows vs Unix) and normalizes paths.
 */
export async function executePlaywrightTest(
  specPath: string,
  options: ExecuteTestOptions = {}
): Promise<{ success: boolean; exitCode: number }> {
  const args = buildPlaywrightArgs(specPath, options);
  const isWindows = process.platform === 'win32';

  p.log.step(pc.bold(pc.cyan(`Running Playwright: npx ${args.join(' ')}`)));

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(isWindows ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit',
      shell: isWindows,
      cwd: options.cwd || process.cwd(),
    });

    child.on('error', (err) => {
      logError(`Failed to start Playwright runner: ${err.message}`);
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });

  const success = exitCode === 0;
  if (success) {
    p.log.success(pc.green('All Playwright test assertions passed successfully!'));
  } else {
    p.log.warn(pc.yellow(`Playwright test execution finished with failure (exit code ${exitCode}).`));
  }

  return { success, exitCode };
}

/**
 * Opens the Playwright HTML test report in the browser.
 */
export async function openPlaywrightReport(cwd?: string): Promise<void> {
  const isWindows = process.platform === 'win32';
  p.log.step(pc.cyan('Serving Playwright HTML Report (Press Ctrl+C in terminal when done)...'));

  await new Promise<void>((resolve) => {
    const child = spawn(isWindows ? 'npx.cmd' : 'npx', ['playwright', 'show-report'], {
      stdio: 'inherit',
      shell: isWindows,
      cwd: cwd || process.cwd(),
    });

    child.on('error', (err) => {
      logError(`Failed to open report: ${err.message}`);
      resolve();
    });

    child.on('close', () => {
      resolve();
    });
  });
}

/**
 * Interactive test runner CLI that lists available tests and allows selecting which to execute.
 */
export async function runInteractiveTestPicker(
  specTarget?: string,
  options: TestPickerOptions = {}
): Promise<void> {
  const rootDir = options.cwd || process.cwd();
  const testsDir = path.resolve(rootDir, 'tests');

  // If a direct spec target was supplied (e.g. clickspec test tests/porto.spec.ts)
  if (specTarget) {
    const { success } = await executePlaywrightTest(specTarget, { headless: options.headless, cwd: rootDir });
    if (process.stdin.isTTY) {
      const viewReport = await p.confirm({
        message: 'Open HTML test report in browser?',
        initialValue: !success,
      });
      if (!p.isCancel(viewReport) && viewReport) {
        await openPlaywrightReport(rootDir);
      }
    }
    return;
  }

  // If --all was passed, run all tests in tests/
  if (options.all) {
    const { success } = await executePlaywrightTest('tests', { headless: options.headless, cwd: rootDir });
    if (process.stdin.isTTY) {
      const viewReport = await p.confirm({
        message: 'Open HTML test report in browser?',
        initialValue: !success,
      });
      if (!p.isCancel(viewReport) && viewReport) {
        await openPlaywrightReport(rootDir);
      }
    }
    return;
  }

  // Find all test files
  const testFiles = await findTestFiles(testsDir);

  if (testFiles.length === 0) {
    p.log.warn(pc.yellow('No Playwright test files found in ./tests directory.'));
    p.note('Record a test first using:\n  npm run dev -- <url>', 'No Tests Found');
    return;
  }

  p.intro(pc.bgCyan(pc.black(' clickspec test runner ')));

  const choices = [
    {
      value: 'ALL',
      label: pc.bold(pc.cyan(`⚡ Run all ${testFiles.length} test suites`)),
    },
    ...testFiles.map((filePath) => {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const fileName = path.basename(filePath);
      return {
        value: relPath,
        label: relPath,
        hint: fileName,
      };
    }),
  ];

  const selected = await p.select({
    message: 'Select a Playwright test to execute:',
    options: choices,
  });

  if (p.isCancel(selected)) {
    p.cancel('Test execution cancelled.');
    return;
  }

  const targetPath = selected === 'ALL' ? 'tests' : (selected as string);
  const { success } = await executePlaywrightTest(targetPath, { headless: options.headless, cwd: rootDir });

  if (process.stdin.isTTY) {
    const viewReport = await p.confirm({
      message: 'Open HTML test report in browser?',
      initialValue: !success,
    });

    if (!p.isCancel(viewReport) && viewReport) {
      await openPlaywrightReport(rootDir);
    }
  }

  p.outro(pc.green('Test execution finished.'));
}
