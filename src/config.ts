import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import type { AIProviderConfig } from './types.js';

// Attempt to load .env from current working directory or ancestors
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export interface AppConfig {
  ai: AIProviderConfig;
  defaultOutputPath: string;
  defaultViewport: {
    width: number;
    height: number;
  };
  debug: boolean;
}

export function getAIProviderConfig(): AIProviderConfig {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model: process.env.CLICK_SPEC_MODEL || 'gemini-3.5-flash',
    };
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: process.env.CLICK_SPEC_MODEL || 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL || undefined,
    };
  }

  throw new Error(
    'No AI API key found! Please configure GEMINI_API_KEY (recommended) or OPENAI_API_KEY in your .env file or environment.'
  );
}

export function hasAIKeyConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  );
}

export function getConfig(): AppConfig {
  let aiConfig: AIProviderConfig;
  try {
    aiConfig = getAIProviderConfig();
  } catch {
    // Return dummy structure for non-AI operations or before prompt validation
    aiConfig = {
      provider: 'gemini',
      apiKey: '',
      model: process.env.CLICK_SPEC_MODEL || 'gemini-3.8-flash',
    };
  }

  return {
    ai: aiConfig,
    defaultOutputPath: './tests/flow.spec.ts',
    defaultViewport: {
      width: 1280,
      height: 800,
    },
    debug: process.env.CLICK_SPEC_DEBUG === 'true',
  };
}

