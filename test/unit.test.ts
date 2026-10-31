import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventNormalizer } from '../src/core/normalizer.js';
import { formatGeneratedTest } from '../src/utils/formatter.js';
import { buildSynthesisUserPrompt } from '../src/ai/prompt.js';
import type { RecordedEvent } from '../src/types.js';

describe('EventNormalizer', () => {
  it('should debounce rapid input events into a single atomic fill action', () => {
    const normalizer = new EventNormalizer();
    const rawEvents: RecordedEvent[] = [
      {
        id: '1',
        timestamp: 1000,
        type: 'input',
        url: 'http://localhost:3000/login',
        inputValue: 'u',
        element: {
          tagName: 'input',
          id: 'username',
          name: 'username',
          role: 'textbox',
          ariaLabel: 'Username',
          placeholder: 'Enter username',
        },
      },
      {
        id: '2',
        timestamp: 1100,
        type: 'input',
        url: 'http://localhost:3000/login',
        inputValue: 'us',
        element: {
          tagName: 'input',
          id: 'username',
          name: 'username',
          role: 'textbox',
          ariaLabel: 'Username',
          placeholder: 'Enter username',
        },
      },
      {
        id: '3',
        timestamp: 1200,
        type: 'input',
        url: 'http://localhost:3000/login',
        inputValue: 'user123',
        element: {
          tagName: 'input',
          id: 'username',
          name: 'username',
          role: 'textbox',
          ariaLabel: 'Username',
          placeholder: 'Enter username',
        },
      },
    ];

    const sequence = normalizer.normalize(rawEvents, 'http://localhost:3000/login');

    assert.equal(sequence.events.length, 1);
    assert.equal(sequence.events[0].action, 'fill');
    assert.equal(sequence.events[0].value, 'user123');
    assert.equal(sequence.metadata.totalRawEvents, 3);
    assert.equal(sequence.metadata.normalizedCount, 1);
  });

  it('should deduplicate accidental double clicks within threshold', () => {
    const normalizer = new EventNormalizer({ clickDedupeMs: 250 });
    const rawEvents: RecordedEvent[] = [
      {
        id: '1',
        timestamp: 1000,
        type: 'click',
        url: 'http://localhost:3000/cart',
        element: {
          tagName: 'button',
          id: 'checkout-btn',
          role: 'button',
          textContent: 'Checkout',
        },
      },
      {
        id: '2',
        timestamp: 1050, // 50ms later (rapid double click)
        type: 'click',
        url: 'http://localhost:3000/cart',
        element: {
          tagName: 'button',
          id: 'checkout-btn',
          role: 'button',
          textContent: 'Checkout',
        },
      },
    ];

    const sequence = normalizer.normalize(rawEvents, 'http://localhost:3000/cart');

    assert.equal(sequence.events.length, 1);
    assert.equal(sequence.events[0].action, 'click');
    assert.match(sequence.events[0].description, /Checkout/);
  });

  it('should deduplicate consecutive identical navigations', () => {
    const normalizer = new EventNormalizer();
    const rawEvents: RecordedEvent[] = [
      {
        id: '1',
        timestamp: 1000,
        type: 'navigation',
        url: 'http://localhost:3000/dashboard',
        navigationUrl: 'http://localhost:3000/dashboard',
      },
      {
        id: '2',
        timestamp: 1100,
        type: 'navigation',
        url: 'http://localhost:3000/dashboard',
        navigationUrl: 'http://localhost:3000/dashboard',
      },
      {
        id: '3',
        timestamp: 2000,
        type: 'navigation',
        url: 'http://localhost:3000/profile',
        navigationUrl: 'http://localhost:3000/profile',
      },
    ];

    const sequence = normalizer.normalize(rawEvents, 'http://localhost:3000/dashboard');

    assert.equal(sequence.events.length, 2);
    assert.equal(sequence.events[0].value, 'http://localhost:3000/dashboard');
    assert.equal(sequence.events[1].value, 'http://localhost:3000/profile');
  });

  it('should attach smart assertion hook candidates to preceding action', () => {
    const normalizer = new EventNormalizer();
    const rawEvents: RecordedEvent[] = [
      {
        id: '1',
        timestamp: 1000,
        type: 'click',
        url: 'http://localhost:3000/login',
        element: {
          tagName: 'button',
          role: 'button',
          textContent: 'Sign In',
        },
      },
      {
        id: '2',
        timestamp: 1400, // 400ms after submit click
        type: 'state_mutation',
        url: 'http://localhost:3000/dashboard',
        assertionCandidates: [
          {
            kind: 'toast_or_alert',
            description: 'Alert/Notification visible: "Welcome back!"',
            expectedValue: 'Welcome back!',
          },
        ],
      },
    ];

    const sequence = normalizer.normalize(rawEvents, 'http://localhost:3000/login');

    assert.equal(sequence.events.length, 1);
    assert.equal(sequence.events[0].action, 'click');
    assert.ok(sequence.events[0].assertions);
    assert.equal(sequence.events[0].assertions?.length, 1);
    assert.equal(sequence.events[0].assertions?.[0].expectedValue, 'Welcome back!');
  });
});

describe('formatGeneratedTest', () => {
  it('should strip markdown code fences cleanly', () => {
    const markdown = '```typescript\nimport { test, expect } from \'@playwright/test\';\ntest(\'test\', async ({ page }) => {});\n```';
    const result = formatGeneratedTest(markdown);

    assert.equal(result.isValid, true);
    assert.ok(!result.code.includes('```'));
    assert.match(result.code, /import { test, expect }/);
  });

  it('should inject @playwright/test import if missing', () => {
    const codeWithoutImport = 'test(\'flow\', async ({ page }) => {\n  await page.goto(\'http://example.com\');\n});';
    const result = formatGeneratedTest(codeWithoutImport);

    assert.equal(result.isValid, true);
    assert.match(result.code, /import { test, expect } from '@playwright\/test';/);
  });

  it('should wrap bare steps in test block if missing', () => {
    const bareCode = 'await page.goto(\'http://example.com\');\nawait page.getByRole(\'button\').click();';
    const result = formatGeneratedTest(bareCode, 'Auto-generated Flow');

    assert.equal(result.isValid, true);
    assert.match(result.code, /test\('Auto-generated Flow'/);
    assert.match(result.code, /await page\.getByRole\('button'\)\.click\(\);/);
  });
});

describe('buildSynthesisUserPrompt', () => {
  it('should format sequence and prompt with user flow details', () => {
    const prompt = buildSynthesisUserPrompt(
      {
        initialUrl: 'http://localhost:3000',
        startedAt: 1000,
        endedAt: 2000,
        events: [
          {
            id: 'norm_1',
            action: 'click',
            timestamp: 1500,
            url: 'http://localhost:3000',
            description: 'Click button "Get Started"',
          },
        ],
        metadata: {
          totalRawEvents: 1,
          normalizedCount: 1,
        },
      },
      'Test User Journey'
    );

    assert.match(prompt, /Test User Journey/);
    assert.match(prompt, /http:\/\/localhost:3000/);
    assert.match(prompt, /Click button/);
    assert.match(prompt, /Get Started/);
  });
});
