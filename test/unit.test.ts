import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventNormalizer } from '../src/core/normalizer.js';
import { formatGeneratedTest, formatPOMResult } from '../src/utils/formatter.js';
import { buildSynthesisUserPrompt, buildPOMSynthesisUserPrompt } from '../src/ai/prompt.js';
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

  it('should inject devices import and test.use when deviceName is provided', () => {
    const rawCode = `import { test, expect } from '@playwright/test';

test('Mobile Test', async ({ page }) => {
  await page.goto('https://example.com');
});`;
    const result = formatGeneratedTest(rawCode, 'Mobile Test', 'Pixel 7');

    assert.equal(result.isValid, true);
    assert.match(result.code, /import\s*\{[^}]*devices[^}]*\}\s*from\s*['"]@playwright\/test['"]/);
    assert.match(result.code, /test\.use\(\{\s*\.\.\.devices\['Pixel 7'\],[\s\S]*defaultBrowserType:\s*'chromium'/);
  });

  it('should inject toHaveScreenshot assertion when visual option is true', () => {
    const rawCode = `import { test, expect } from '@playwright/test';

test('Visual Test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.getByRole('heading')).toBeVisible();
});`;
    const result = formatGeneratedTest(rawCode, 'Visual Test', undefined, true);

    assert.equal(result.isValid, true);
    assert.match(result.code, /toHaveScreenshot\(\{\s*maxDiffPixelRatio:\s*0\.05\s*\}\)/);
  });

  it('should inject storageState in test.use when storageState is provided', () => {
    const rawCode = `import { test, expect } from '@playwright/test';

test('Authenticated Test', async ({ page }) => {
  await page.goto('https://example.com/dashboard');
});`;
    const result = formatGeneratedTest(rawCode, 'Authenticated Test', undefined, false, 'auth/user.json');

    assert.equal(result.isValid, true);
    assert.match(result.code, /test\.use\(\{\s*storageState:\s*'auth\/user\.json',?\s*\}\);/);
  });

  it('should merge storageState and deviceName into single test.use block', () => {
    const rawCode = `import { test, expect } from '@playwright/test';

test('Mobile Auth Test', async ({ page }) => {
  await page.goto('https://example.com/dashboard');
});`;
    const result = formatGeneratedTest(rawCode, 'Mobile Auth Test', 'Pixel 7', false, 'auth/mobile-user.json');

    assert.equal(result.isValid, true);
    assert.match(result.code, /test\.use\(\{[\s\S]*\.\.\.devices\['Pixel 7'\]/);
    assert.match(result.code, /test\.use\(\{[\s\S]*storageState:\s*'auth\/mobile-user\.json'/);
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

describe('formatPOMResult', () => {
  it('should parse tagged output into Page Object and Spec cleanly', () => {
    const rawAiOutput = `
<<<PAGE_OBJECT>>>
import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly loginBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginBtn = page.getByRole('button', { name: 'Log in' });
  }

  async clickLogin() {
    await this.loginBtn.click();
  }
}
<<<END_PAGE_OBJECT>>>

<<<SPEC>>>
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';

test('User can log in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await page.goto('https://example.com/login');
  await loginPage.clickLogin();
  await expect(page).toHaveURL('https://example.com/dashboard');
});
<<<END_SPEC>>>
`;

    const result = formatPOMResult(rawAiOutput, 'LoginPage', '../pages/LoginPage.js', 'User can log in');

    assert.equal(result.isValid, true);
    assert.match(result.pageObjectCode, /export class LoginPage/);
    assert.match(result.pageObjectCode, /readonly loginBtn: Locator/);
    assert.match(result.specCode, /import { LoginPage } from '\.\.\/pages\/LoginPage\.js'/);
    assert.match(result.specCode, /test\('User can log in'/);
    assert.ok(!result.pageObjectCode.includes('<<<PAGE_OBJECT>>>'));
    assert.ok(!result.specCode.includes('<<<SPEC>>>'));
  });

  it('should inject missing imports into Page Object and Spec', () => {
    const rawAiOutput = `
<<<PAGE_OBJECT>>>
export class DashboardPage {
  constructor(page) {
    this.page = page;
  }
}
<<<END_PAGE_OBJECT>>>

<<<SPEC>>>
test('dashboard check', async ({ page }) => {
  const dash = new DashboardPage(page);
});
<<<END_SPEC>>>
`;

    const result = formatPOMResult(rawAiOutput, 'DashboardPage', '../pages/DashboardPage.js');

    assert.equal(result.isValid, true);
    assert.match(result.pageObjectCode, /import type { Page, Locator } from '@playwright\/test';/);
    assert.match(result.specCode, /import { test, expect } from '@playwright\/test';/);
    assert.match(result.specCode, /import { DashboardPage } from '\.\.\/pages\/DashboardPage\.js';/);
  });

  it('should handle fallback when AI omits tags', () => {
    const rawAiOutput = `
export class OrderPage {
  constructor(public page: any) {}
}

test('Order flow', async ({ page }) => {
  const order = new OrderPage(page);
});
`;

    const result = formatPOMResult(rawAiOutput, 'OrderPage', '../pages/OrderPage.js');

    assert.equal(result.isValid, true);
    assert.match(result.pageObjectCode, /export class OrderPage/);
    assert.match(result.specCode, /test\('Order flow'/);
    assert.ok(result.warnings.some((w) => w.includes('heuristic separation')));
  });

  it('should return invalid for empty response', () => {
    const result = formatPOMResult('');
    assert.equal(result.isValid, false);
    assert.equal(result.warnings.length > 0, true);
  });

  it('should inject device emulation into POM spec when deviceName is provided', () => {
    const rawPOM = `
<<<PAGE_OBJECT>>>
export class MobilePage {
  readonly page: Page;
}
<<<END_PAGE_OBJECT>>>
<<<SPEC>>>
import { test, expect } from '@playwright/test';
import { MobilePage } from '../pages/MobilePage.js';

test('Mobile POM Journey', async ({ page }) => {
  await page.goto('https://example.com');
});
<<<END_SPEC>>>
`;
    const result = formatPOMResult(rawPOM, 'MobilePage', '../pages/MobilePage.js', 'Mobile POM Journey', 'Pixel 7');
    assert.equal(result.isValid, true);
    assert.match(result.specCode, /import\s*\{[^}]*devices[^}]*\}\s*from\s*['"]@playwright\/test['"]/);
    assert.match(result.specCode, /test\.use\(\{\s*\.\.\.devices\['Pixel 7'\],[\s\S]*defaultBrowserType:\s*'chromium'/);
  });

  it('should inject storageState into POM spec when auth is provided', () => {
    const rawPOM = `
<<<PAGE_OBJECT>>>
export class AuthDashboardPage {
  readonly page: Page;
}
<<<END_PAGE_OBJECT>>>
<<<SPEC>>>
import { test, expect } from '@playwright/test';
import { AuthDashboardPage } from '../pages/AuthDashboardPage.js';

test('Dashboard Journey', async ({ page }) => {
  await page.goto('https://example.com/dashboard');
});
<<<END_SPEC>>>
`;
    const result = formatPOMResult(
      rawPOM,
      'AuthDashboardPage',
      '../pages/AuthDashboardPage.js',
      'Dashboard Journey',
      undefined,
      false,
      'auth/admin.json'
    );
    assert.equal(result.isValid, true);
    assert.match(result.specCode, /test\.use\(\{\s*storageState:\s*'auth\/admin\.json',?\s*\}\);/);
  });
});

describe('buildPOMSynthesisUserPrompt', () => {
  it('should format POM prompt with class name, relative import, and sequence', () => {
    const prompt = buildPOMSynthesisUserPrompt(
      {
        initialUrl: 'https://example.com/checkout',
        startedAt: 1000,
        endedAt: 3000,
        events: [
          {
            id: 'norm_1',
            action: 'click',
            timestamp: 2000,
            url: 'https://example.com/checkout',
            description: 'Click button "Place Order"',
          },
        ],
        metadata: {
          totalRawEvents: 1,
          normalizedCount: 1,
        },
      },
      'CheckoutPage',
      '../pages/CheckoutPage.js',
      'Checkout Journey'
    );

    assert.match(prompt, /CheckoutPage/);
    assert.match(prompt, /\.\.\/pages\/CheckoutPage\.js/);
    assert.match(prompt, /https:\/\/example\.com\/checkout/);
    assert.match(prompt, /Place Order/);
    assert.match(prompt, /<<<PAGE_OBJECT>>>/);
  });
});
