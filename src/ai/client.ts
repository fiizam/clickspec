import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { getAIProviderConfig } from '../config.js';
import type { AIProviderConfig } from '../types.js';

export interface AIClient {
  readonly provider: 'gemini' | 'openai';
  readonly model: string;
  generateText(systemPrompt: string, userPrompt: string): Promise<string>;
}

class GeminiAIClient implements AIClient {
  public readonly provider = 'gemini' as const;
  public readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.model = model || 'gemini-3.8-flash';
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini API returned an empty response.');
      }
      return text;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Gemini API Error (${this.model}): ${error.message}`);
      }
      throw new Error(`Gemini API Error: ${String(error)}`);
    }
  }
}

class OpenAIAIClient implements AIClient {
  public readonly provider = 'openai' as const;
  public readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.model = model || 'gpt-4o-mini';
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
  }

  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        throw new Error('OpenAI API returned an empty response.');
      }
      return text;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`OpenAI API Error (${this.model}): ${error.message}`);
      }
      throw new Error(`OpenAI API Error: ${String(error)}`);
    }
  }
}

/**
 * Initializes and returns the active AI client based on available environment variables
 * or explicit provider configuration.
 */
export function createAIClient(overrideConfig?: Partial<AIProviderConfig>): AIClient {
  const baseConfig = getAIProviderConfig();
  const provider = overrideConfig?.provider ?? baseConfig.provider;
  const apiKey = overrideConfig?.apiKey ?? baseConfig.apiKey;
  const model = overrideConfig?.model ?? baseConfig.model;
  const baseUrl = overrideConfig?.baseUrl ?? baseConfig.baseUrl;

  if (!apiKey) {
    throw new Error(
      'Missing API key. Please set GEMINI_API_KEY in your .env or export it in your shell environment.'
    );
  }

  if (provider === 'gemini') {
    return new GeminiAIClient(apiKey, model);
  }

  if (provider === 'openai') {
    return new OpenAIAIClient(apiKey, model, baseUrl);
  }

  throw new Error(`Unsupported AI provider: ${String(provider)}`);
}

