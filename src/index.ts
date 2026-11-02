import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { BrowserSession } from './core/browser.js';
import { EventNormalizer } from './core/normalizer.js';
import { synthesizePlaywrightTest } from './ai/synthesizer.js';
import { getConfig, hasAIKeyConfigured } from './config.js';
import { printBanner, printCompletionCard, logInfo, logWarn, logError } from './utils/logger.js';
import type { RecordedEvent } from './types.js';

interface CliOptions {
  output?: string;
  model?: string;
  title?: string;
  headless?: boolean;
  debug?: boolean;
  pom?: boolean;
  pagePath?: string;
}

async function runCli(targetUrlArg?: string, options: CliOptions = {}): Promise<void> {
  printBanner();

  // 1. Check or prompt for AI API Key
  if (!hasAIKeyConfigured()) {
    p.log.warn(
      pc.yellow('No GEMINI_API_KEY or OPENAI_API_KEY detected in your environment.')
    );
    p.note(
      'Get a free Gemini API key at: https://aistudio.google.com/\nOr add GEMINI_API_KEY=... to a .env file.',
      'API Key Required'
    );

    const enteredKey = await p.password({
      message: 'Enter your Gemini API key (or OpenAI key) to continue:',
      validate(value) {
        if (!value || value.trim().length === 0) {
          return 'API key is required to synthesize test specs.';
        }
      },
    });

    if (p.isCancel(enteredKey)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    if (enteredKey.startsWith('sk-')) {
      process.env.OPENAI_API_KEY = enteredKey.trim();
    } else {
      process.env.GEMINI_API_KEY = enteredKey.trim();
    }
  }

  // 2. Resolve Target URL
  let targetUrl = targetUrlArg?.trim();
  if (!targetUrl) {
    const urlInput = await p.text({
      message: 'Enter the target URL to record interactions on:',
      placeholder: 'http://localhost:3000',
      initialValue: 'http://localhost:3000',
      validate(value) {
        if (!value || value.trim().length === 0) {
          return 'Target URL is required.';
        }
      },
    });

    if (p.isCancel(urlInput)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    targetUrl = urlInput.trim();
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `http://${targetUrl}`;
  }

  // 3. Resolve Output File Path
  let outputPath = options.output?.trim();
  if (!outputPath) {
    const config = getConfig();
    const outputInput = await p.text({
      message: 'Output path for generated Playwright spec:',
      placeholder: config.defaultOutputPath,
      initialValue: config.defaultOutputPath,
      validate(value) {
        if (!value || value.trim().length === 0) {
          return 'Output path cannot be empty.';
        }
        if (!value.endsWith('.ts') && !value.endsWith('.js')) {
          return 'Output file must end with .spec.ts or .ts';
        }
      },
    });

    if (p.isCancel(outputInput)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    outputPath = outputInput.trim();
  }

  // 4. Launch Browser Recording Session
  const config = getConfig();
  const s = p.spinner();
  s.start(
    pc.cyan(
      `Launching browser at ${targetUrl}... (Close browser or press Enter in terminal when done)`
    )
  );

  let session: BrowserSession | null = null;
  const recordedEvents: RecordedEvent[] = [];

  try {
    session = await BrowserSession.launch({
      targetUrl,
      headless: options.headless ?? false,
      viewport: config.defaultViewport,
      onEvent: (evt) => {
        recordedEvents.push(evt);
        if (options.debug) {
          logInfo(`Captured [${evt.type}]: ${evt.element?.tagName || evt.url}`);
        }
      },
    });

    await session.navigate(targetUrl);
    s.message(
      pc.green(
        `Recording interactions on ${targetUrl}... (Close window or press [Enter] here to finish)`
      )
    );

    // Wait for either: user presses Enter in terminal OR closes the browser window
    await waitForTerminationSignal(session);

    // Ensure session is closed and get all final events
    const finalRawEvents = await session.stop();
    s.stop(
      pc.green(
        `Recording completed! Captured ${finalRawEvents.length} raw browser events.`
      )
    );

    if (finalRawEvents.length === 0) {
      logWarn('No user interactions were recorded during the session.');
      const continueSynthesis = await p.confirm({
        message: 'Do you still want to generate a baseline navigation test for this URL?',
        initialValue: true,
      });

      if (p.isCancel(continueSynthesis) || !continueSynthesis) {
        p.outro('Test generation aborted.');
        return;
      }
    }

    // 5. Event Normalization & Deduplication
    const normalizer = new EventNormalizer();
    const sequence = normalizer.normalize(finalRawEvents, targetUrl);

    if (options.debug) {
      logInfo(
        `DEBUG: Normalized into ${sequence.events.length} actions: ` +
          sequence.events.map((e) => e.description).join(' -> ')
      );
    }

    // 6. AI Code Synthesis
    const synthSpinner = p.spinner();
    synthSpinner.start(pc.cyan('Analyzing interaction sequence with AI and synthesizing Playwright spec...'));

    const synthesisResult = await synthesizePlaywrightTest(sequence, {
      url: targetUrl,
      outputPath,
      testTitle: options.title,
      modelName: options.model,
      debug: options.debug,
      pom: options.pom,
      pageObjectPath: options.pagePath,
    });

    if (!synthesisResult.success) {
      synthSpinner.stop(pc.red('AI synthesis failed!'));
      logError(synthesisResult.error || 'Unknown AI error occurred.');
      process.exit(1);
    }

    synthSpinner.stop(pc.green('Playwright test synthesized successfully!'));

    // 7. Present Actionable Completion Card
    printCompletionCard(
      path.relative(process.cwd(), synthesisResult.outputPath),
      sequence.metadata.normalizedCount,
      synthesisResult.modelUsed,
      synthesisResult.pageObjectPath
        ? path.relative(process.cwd(), synthesisResult.pageObjectPath)
        : undefined
    );

    p.outro(pc.bold(pc.green('All done! Happy testing.')));
  } catch (error: unknown) {
    s.stop(pc.red('Execution failed'));
    if (session) {
      await session.stop();
    }
    const message = error instanceof Error ? error.message : String(error);
    logError(`An error occurred: ${message}`, error);
    process.exit(1);
  }
}

function waitForTerminationSignal(session: BrowserSession): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;

      try {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
      } catch {
        // Ignore terminal teardown issues
      }

      resolve();
    };

    const onData = (chunk: Buffer) => {
      const code = chunk[0];
      // Enter key (CR or LF)
      if (code === 13 || code === 10) {
        cleanup();
      } else if (code === 3) {
        // Ctrl+C
        cleanup();
        p.cancel('Cancelled by user.');
        process.exit(0);
      }
    };

    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', onData);
      } catch {
        // Fallback for non-raw stdin
        process.stdin.resume();
        process.stdin.once('data', () => cleanup());
      }
    } else {
      process.stdin.resume();
      process.stdin.once('data', () => cleanup());
    }

    session.waitForCompletion().then(() => {
      cleanup();
    });
  });
}

const program = new Command();

program
  .name('clickspec')
  .description('AI-Powered E2E Playwright Test Generator CLI')
  .version('1.0.0')
  .argument('[url]', 'Target URL to record (e.g. http://localhost:3000)')
  .option('-o, --output <path>', 'Output path for generated test spec (default: ./tests/flow.spec.ts)')
  .option('-m, --model <name>', 'AI model to use (default: gemini-3.8-flash or gpt-4o-mini)')
  .option('--title <title>', 'Descriptive title for the test')
  .option('--pom', 'Generate structured Page Object Model (POM) classes and spec')
  .option('--page-path <path>', 'Custom destination path for Page Object class (used with --pom)')
  .option('--headless', 'Run browser in headless mode')
  .option('--debug', 'Enable verbose debug logging')
  .action(async (url?: string, options?: CliOptions) => {
    try {
      await runCli(url, options);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logError(message);
      process.exit(1);
    }
  });

program.parse(process.argv);

