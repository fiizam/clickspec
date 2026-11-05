import fs from 'node:fs/promises';
import path from 'node:path';
import { createAIClient } from './client.js';
import {
  SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
  POM_SYSTEM_PROMPT,
  buildPOMSynthesisUserPrompt,
} from './prompt.js';
import { formatGeneratedTest, formatPOMResult } from '../utils/formatter.js';
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

    const absoluteOutputPath = path.resolve(process.cwd(), options.outputPath);

    // ==========================================
    // 1. PAGE OBJECT MODEL (POM) SYNTHESIS FLOW
    // ==========================================
    if (options.pom) {
      const pageClassName = derivePageClassName(options.outputPath);
      const defaultPageObjectPath =
        options.pageObjectPath ||
        path.resolve(process.cwd(), 'pages', `${pageClassName}.ts`);
      const absolutePOPath = path.resolve(process.cwd(), defaultPageObjectPath);

      // Derive clean relative import for ESM / TypeScript
      let relativeImport = path
        .relative(path.dirname(absoluteOutputPath), absolutePOPath)
        .replace(/\\/g, '/');
      if (!relativeImport.startsWith('.')) {
        relativeImport = `./${relativeImport}`;
      }
      relativeImport = relativeImport.replace(/\.ts$/, '');

      logInfo(`Mode: Page Object Model (${pageClassName} in ${path.relative(process.cwd(), absolutePOPath)})`);

      const userPrompt = buildPOMSynthesisUserPrompt(
        sequence,
        pageClassName,
        relativeImport,
        options.testTitle,
        options.deviceName,
        options.visual
      );

      if (options.debug) {
        logInfo(`DEBUG: POM prompt payload length: ${userPrompt.length} chars`);
      }

      const rawResponse = await aiClient.generateText(POM_SYSTEM_PROMPT, userPrompt);
      const formatted = formatPOMResult(
        rawResponse,
        pageClassName,
        relativeImport,
        options.testTitle || `Journey for ${options.url}`,
        options.deviceName,
        options.visual
      );

      if (formatted.warnings.length > 0 && options.debug) {
        for (const warning of formatted.warnings) {
          logWarn(`Formatter notice: ${warning}`);
        }
      }

      // Ensure destination folders exist
      await fs.mkdir(path.dirname(absolutePOPath), { recursive: true });
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });

      // Write Page Object class and Spec file
      await fs.writeFile(absolutePOPath, formatted.pageObjectCode, 'utf-8');
      await fs.writeFile(absoluteOutputPath, formatted.specCode, 'utf-8');

      return {
        success: true,
        code: formatted.specCode,
        outputPath: absoluteOutputPath,
        isPom: true,
        pageObjectPath: absolutePOPath,
        pageObjectCode: formatted.pageObjectCode,
        deviceName: options.deviceName,
        visual: options.visual,
        modelUsed: `${aiClient.provider}:${aiClient.model}`,
        stats: {
          rawEventsCount,
          normalizedEventsCount,
          durationMs: Date.now() - startTime,
        },
      };
    }

    // ==========================================
    // 2. STANDARD FLAT SPEC SYNTHESIS FLOW
    // ==========================================
    const userPrompt = buildSynthesisUserPrompt(
      sequence,
      options.testTitle,
      options.deviceName,
      options.visual
    );

    if (options.debug) {
      logInfo(`DEBUG: User prompt payload length: ${userPrompt.length} chars`);
    }

    const rawResponse = await aiClient.generateText(SYSTEM_PROMPT, userPrompt);

    const formatted = formatGeneratedTest(
      rawResponse,
      options.testTitle || `Journey for ${options.url}`,
      options.deviceName,
      options.visual
    );

    if (formatted.warnings.length > 0 && options.debug) {
      for (const warning of formatted.warnings) {
        logWarn(`Formatter notice: ${warning}`);
      }
    }

    // Resolve destination path and make sure directory exists
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });

    // Write file to disk
    await fs.writeFile(absoluteOutputPath, formatted.code, 'utf-8');

    return {
      success: true,
      code: formatted.code,
      outputPath: absoluteOutputPath,
      isPom: false,
      deviceName: options.deviceName,
      visual: options.visual,
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

function derivePageClassName(outputPath: string): string {
  const base = path
    .basename(outputPath)
    .replace(/\.(spec|test)\.(ts|js)$/, '')
    .replace(/\.(ts|js)$/, '');

  const cleaned = base
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `${cleaned || 'Flow'}Page`;
}

