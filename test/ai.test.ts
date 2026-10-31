import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAIClient } from '../src/ai/client.js';
import { getAIProviderConfig, hasAIKeyConfigured } from '../src/config.js';

describe('AI Client & Config', () => {
  it('should detect when no keys are configured', () => {
    const originalGemini = process.env.GEMINI_API_KEY;
    const originalOpenAI = process.env.OPENAI_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    assert.equal(hasAIKeyConfigured(), false);
    assert.throws(
      () => getAIProviderConfig(),
      /No AI API key found/
    );

    // Restore
    if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
    if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
  });

  it('should configure Gemini client when GEMINI_API_KEY is present', () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key_12345';
    const client = createAIClient();

    assert.equal(client.provider, 'gemini');
    assert.equal(client.model, 'gemini-3.8-flash');

    delete process.env.GEMINI_API_KEY;
  });

  it('should configure OpenAI client when OPENAI_API_KEY is present', () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test_openai_key_12345';
    const client = createAIClient();

    assert.equal(client.provider, 'openai');
    assert.equal(client.model, 'gpt-4o-mini');

    delete process.env.OPENAI_API_KEY;
  });

  it('should allow custom model overrides', () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key_12345';
    const client = createAIClient({ model: 'gemini-1.5-pro' });

    assert.equal(client.provider, 'gemini');
    assert.equal(client.model, 'gemini-1.5-pro');

    delete process.env.GEMINI_API_KEY;
  });
});

