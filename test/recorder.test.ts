import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSession } from '../src/core/browser.js';
import { EventNormalizer } from '../src/core/normalizer.js';

describe('BrowserSession & InteractionRecorder Integration', () => {
  it('should record user interactions and capture smart assertions in headless mode', async () => {
    // Spin up browser session in headless mode for CI/test environments
    const session = await BrowserSession.launch({
      targetUrl: 'about:blank',
      headless: true,
    });

    const page = session.getPage();
    assert.ok(page, 'Browser page must be active');

    // Serve HTML containing form controls and reactive toast alert via data URL
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Playground</title></head>
        <body>
          <h1>Sign In Portal</h1>
          <label for="user-email">Email Address</label>
          <input id="user-email" type="email" placeholder="you@domain.com" />

          <button id="submit-btn" type="submit">Sign In</button>

          <div id="toast-container"></div>

          <script>
            document.getElementById('submit-btn').addEventListener('click', () => {
              const toast = document.createElement('div');
              toast.setAttribute('role', 'alert');
              toast.className = 'toast alert';
              toast.textContent = 'Login successful! Welcome.';
              document.getElementById('toast-container').appendChild(toast);
            });
          </script>
        </body>
      </html>
    `;

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(rawHtml)}`;
    await page.goto(dataUrl);

    // Simulate user typing into input
    const inputLocator = page.locator('#user-email');
    await inputLocator.focus();
    await page.keyboard.type('alice@example.com', { delay: 10 });

    // Simulate user clicking submit button
    const submitBtn = page.locator('#submit-btn');
    await submitBtn.click();

    // Give smart assertion hook 500ms to detect mutation
    await page.waitForTimeout(600);

    const rawEvents = await session.stop();
    assert.ok(rawEvents.length > 0, 'Should have recorded raw events');

    const clickEvents = rawEvents.filter((e) => e.type === 'click');
    assert.ok(clickEvents.length >= 1, 'Should have recorded click event');

    const inputEvents = rawEvents.filter((e) => e.type === 'input' || e.type === 'change');
    assert.ok(inputEvents.length >= 1, 'Should have recorded input events');

    // Run normalizer
    const normalizer = new EventNormalizer();
    const sequence = normalizer.normalize(rawEvents, 'http://localhost/test');

    assert.ok(sequence.events.length >= 2, 'Should have normalized events');

    const fillAction = sequence.events.find((e) => e.action === 'fill');
    assert.ok(fillAction, 'Should have consolidated fill action');
    assert.equal(fillAction.value, 'alice@example.com');

    const clickAction = sequence.events.find((e) => e.action === 'click');
    assert.ok(clickAction, 'Should have recorded click action');
    assert.match(clickAction.description, /Sign In/);

    // Verify smart assertion hook captured the toast
    const hasToastAssertion = sequence.events.some((e) =>
      e.assertions?.some((a) => a.expectedValue?.includes('Login successful'))
    );
    assert.ok(hasToastAssertion, 'Smart assertion hook should detect toast alert mutation');
  });
});
