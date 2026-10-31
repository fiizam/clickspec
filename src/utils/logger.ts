import pc from 'picocolors';
import type { NormalizedEvent, RecordedEvent } from '../types.js';

export function printBanner(): void {
  const logo = `
   ________  _      __                              
  / ____/ / (_)____/ /__ _____ ____  ___  _____
 / /   / / / / ___/ //_// ___// __ \\/ _ \\/ ___/
/ /___/ / / / /__/ ,<  (__  )/ /_/ /  __/ /__  
\\____/_/_/_/\\___/_/|_|/____// .___/\\___/\\___/  
                           /_/                 
`;
  console.log(pc.cyan(pc.bold(logo)));
  console.log(
    pc.dim('  AI-Powered E2E Playwright Test Generator CLI')
  );
  console.log(
    pc.dim('  Transform live browser clicks & DOM changes into resilient specs\n')
  );
}

export function logInfo(message: string): void {
  console.log(`${pc.cyan('ℹ')} ${pc.white(message)}`);
}

export function logSuccess(message: string): void {
  console.log(`${pc.green('✔')} ${pc.green(message)}`);
}

export function logWarn(message: string): void {
  console.log(`${pc.yellow('⚠')} ${pc.yellow(message)}`);
}

export function logError(message: string, error?: unknown): void {
  console.error(`${pc.red('✖')} ${pc.red(pc.bold(message))}`);
  if (error) {
    if (error instanceof Error && error.stack) {
      console.error(pc.dim(error.stack));
    } else {
      console.error(pc.dim(String(error)));
    }
  }
}

export function formatEventSummary(event: RecordedEvent | NormalizedEvent): string {
  if ('action' in event) {
    // Normalized event
    const actionColor =
      event.action === 'click'
        ? pc.magenta
        : event.action === 'fill'
        ? pc.blue
        : event.action === 'navigate'
        ? pc.cyan
        : pc.yellow;

    return `${actionColor(`[${event.action.toUpperCase()}]`)} ${pc.white(event.description)}`;
  }

  // Raw recorded event
  const typeColor =
    event.type === 'click'
      ? pc.magenta
      : event.type === 'input' || event.type === 'change'
      ? pc.blue
      : event.type === 'navigation'
      ? pc.cyan
      : pc.gray;

  let desc = event.type;
  if (event.element?.role && event.element?.textContent) {
    desc += ` on ${event.element.role} "${event.element.textContent}"`;
  } else if (event.element?.tagName) {
    desc += ` on <${event.element.tagName.toLowerCase()}>`;
  }

  return `${typeColor(`[${event.type}]`)} ${pc.dim(desc)}`;
}

export function printCompletionCard(outputPath: string, eventCount: number, modelName: string): void {
  const line = '─'.repeat(60);
  console.log('\n' + pc.cyan(line));
  console.log(pc.bold(pc.green('  ✨ PLAYWRIGHT SPEC GENERATED SUCCESSFULLY')));
  console.log(pc.cyan(line));
  console.log(`  ${pc.bold('File:')}          ${pc.cyan(outputPath)}`);
  console.log(`  ${pc.bold('Interactions:')}  ${pc.yellow(String(eventCount))} captured events synthesized`);
  console.log(`  ${pc.bold('AI Model:')}      ${pc.magenta(modelName)}`);
  console.log(pc.cyan(line));
  console.log(pc.bold('  Run your new test:'));
  console.log(`  ${pc.bgBlack(pc.green(` npx playwright test ${outputPath} --headed `))}`);
  console.log(`  ${pc.dim(` npx playwright show-report`)}`);
  console.log(pc.cyan(line) + '\n');
}

