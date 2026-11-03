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
  public model: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.model = model || 'gemini-3.5-flash';
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateText(systemPrompt: string, userPrompt: string): Promise<string> {
    const candidateModels = [this.model];
    if (!candidateModels.includes('gemini-3.5-flash')) {
      candidateModels.push('gemini-3.5-flash');
    }
    if (!candidateModels.includes('gemini-3.8-flash')) {
      candidateModels.push('gemini-3.8-flash');
    }

    let lastError: unknown = null;

    for (const currentModel of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.client.models.generateContent({
            model: currentModel,
            contents: userPrompt,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1,
            },
          });

          const text = response.text;
          if (!text) {
            throw new Error(`Gemini API returned an empty response with model ${currentModel}.`);
          }
          this.model = currentModel;
          return text;
        } catch (error: unknown) {
          lastError = error;
          const msg = error instanceof Error ? error.message : String(error);
          const isHighDemandOrRateLimit =
            msg.includes('503') ||
            msg.includes('high demand') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('429');

          if (isHighDemandOrRateLimit && attempt === 1) {
            // Short backoff before retry
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          // If high demand or 404, move to next fallback model
          if (isHighDemandOrRateLimit || msg.includes('404')) {
            break;
          }

          // Fatal/Auth error, do not retry
          if (error instanceof Error) {
            throw new Error(`Gemini API Error (${currentModel}): ${error.message}`);
          }
          throw new Error(`Gemini API Error: ${String(error)}`);
        }
      }
    }

    if (lastError instanceof Error) {
      throw new Error(`Gemini API Error (${this.model}): ${lastError.message}`);
    }
    throw new Error(`Gemini API Error: ${String(lastError)}`);
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

