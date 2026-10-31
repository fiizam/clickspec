import fs from 'node:fs/promises';
import path from 'node:path';
import { createAIClient } from './client.js';
import { SYSTEM_PROMPT, buildSynthesisUserPrompt } from './prompt.js';
import { formatGeneratedTest } from '../utils/formatter.js';
import { logInfo, logWarn } from '../utils/logger.js';
import type { InteractionSequence, TestSynthesisOptions, TestSynthesisResult } from '../types.js';

export async function synthesizePlaywrightTest(
  sequence: InteractionSequence,
  options: TestSynthesisOptions
): Promise<TestSynthesisResult> {
  const startTime = Date.now();
  const rawEventsCount = sequence.metadata.totalRawEvents;
  const normalizedEventsCount = sequence.metadata.normalizedCount;

  try {
    const aiClient = createAIClient({
      model: options.modelName,
    });

    logInfo(`Synthesizing test with AI provider: ${aiClient.provider} (model: ${aiClient.model})...`);

    const userPrompt = buildSynthesisUserPrompt(sequence, options.testTitle);

    if (options.debug) {
      logInfo(`DEBUG: User prompt payload length: ${userPrompt.length} chars`);
    }

    const rawResponse = await aiClient.generateText(SYSTEM_PROMPT, userPrompt);

    const formatted = formatGeneratedTest(rawResponse, options.testTitle || `Journey for ${options.url}`);

    if (formatted.warnings.length > 0 && options.debug) {
      for (const warning of formatted.warnings) {
        logWarn(`Formatter notice: ${warning}`);
      }
    }

    // Resolve destination path and make sure directory exists
    const absoluteOutputPath = path.resolve(process.cwd(), options.outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });

    // Write file to disk
    await fs.writeFile(absoluteOutputPath, formatted.code, 'utf-8');

    return {
      success: true,
      code: formatted.code,
      outputPath: absoluteOutputPath,
      modelUsed: `${aiClient.provider}:${aiClient.model}`,
      stats: {
        rawEventsCount,
        normalizedEventsCount,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code: '',
      outputPath: options.outputPath,
      modelUsed: options.modelName || 'unknown',
      stats: {
        rawEventsCount,
        normalizedEventsCount,
        durationMs: Date.now() - startTime,
      },
      error: errorMessage,
    };
  }
}

