import { spawn } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { logError } from './logger.js';

export interface ExecuteTestOptions {
  headless?: boolean;
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
 * Executes a Playwright test spec using `npx playwright test`.
 * Handles platform differences (Windows vs Unix) and normalizes paths.
 */
export async function executePlaywrightTest(
  specPath: string,
  options: ExecuteTestOptions = {}
): Promise<{ success: boolean; exitCode: number }> {
  const args = buildPlaywrightArgs(specPath, options);
  const isWindows = process.platform === 'win32';

  p.log.step(pc.bold(pc.cyan(`Running Playwright test: npx ${args.join(' ')}`)));

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
