import type { Page } from 'playwright';
import type { RecordedEvent } from '../types.js';

export interface RecorderOptions {
  onEvent?: (event: RecordedEvent) => void;
  debug?: boolean;
}

export const IN_PAGE_OBSERVER_CODE = `
(() => {
  const win = window;
  const doc = document;

  function safeTrim(str, maxLen) {
    if (!str || typeof str !== 'string') return '';
    const trimmed = str.replace(/\\s+/g, ' ').trim();
    const limit = maxLen || 40;
    return trimmed.length > limit ? trimmed.slice(0, limit) + '...' : trimmed;
  }

  function resolveAccessibleRole(el) {
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole.toLowerCase();

    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return tag;
  }

  function resolveAccessibleLabel(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const target = document.getElementById(ariaLabelledBy);
      if (target && target.textContent) return target.textContent.trim();
    }

    if (el.id) {
      const label = document.querySelector('label[for="' + el.id + '"]');
      if (label && label.textContent) return label.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }

    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    const title = el.getAttribute('title');
    if (title) return title.trim();

    return undefined;
  }

  function snapshotElement(el) {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const role = resolveAccessibleRole(el);
    const label = resolveAccessibleLabel(el);
    const placeholder = el.getAttribute('placeholder') || undefined;
    const textContent = safeTrim(el.innerText || el.textContent || '');
    const id = el.id || undefined;
    const name = el.getAttribute('name') || undefined;
    const type = el.getAttribute('type') || undefined;
    const testId =
      el.getAttribute('data-testid') ||
      el.getAttribute('data-test') ||
      el.getAttribute('data-qa') ||
      undefined;

    const selectorHints = {};

    if (testId) {
      selectorHints.testId = testId;
      selectorHints.bestSelector = "getByTestId('" + testId + "')";
    } else if (label) {
      selectorHints.labelSelector = label;
      selectorHints.bestSelector = "getByLabel('" + label + "')";
    } else if (role && (textContent || label)) {
      selectorHints.roleSelector = role;
      selectorHints.bestSelector = "getByRole('" + role + "', { name: '" + (label || textContent) + "' })";
    } else if (placeholder) {
      selectorHints.placeholderSelector = placeholder;
      selectorHints.bestSelector = "getByPlaceholder('" + placeholder + "')";
    } else if (textContent && textContent.length < 30) {
      selectorHints.textSelector = textContent;
      selectorHints.bestSelector = "getByText('" + textContent + "')";
    }

    let value = undefined;
    if ('value' in el && typeof el.value === 'string') {
      value = el.value;
    }

    return {
      tagName: tag,
      id: id,
      name: name,
      type: type,
      role: role,
      ariaLabel: label,
      placeholder: placeholder,
      textContent: textContent,
      value: value,
      selectorHints: selectorHints,
      position: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      isVisible: rect.width > 0 && rect.height > 0,
    };
  }

  function captureHighSignalMutations() {
    const candidates = [];

    // Check for alerts, toasts, banners
    const alertElements = document.querySelectorAll(
      '[role="alert"], [role="status"], .toast, .alert, .notification, .banner, .snackbar'
    );
    for (let i = 0; i < alertElements.length; i++) {
      const el = alertElements[i];
      const text = safeTrim(el.innerText || el.textContent || '', 80);
      if (text) {
        candidates.push({
          kind: 'toast_or_alert',
          description: 'Alert/Notification visible: "' + text + '"',
          element: snapshotElement(el),
          expectedValue: text,
        });
      }
    }

    // Check for headings
    const headings = document.querySelectorAll('h1, h2, h3');
    for (let i = 0; i < headings.length; i++) {
      const el = headings[i];
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const text = safeTrim(el.innerText || el.textContent || '', 50);
        if (text) {
          candidates.push({
            kind: 'heading_change',
            description: 'Heading visible: "' + text + '"',
            element: snapshotElement(el),
            expectedValue: text,
          });
        }
      }
    }

    return candidates;
  }

  function sendToBridge(payload) {
    try {
      if (typeof win.__clickspec_record_event__ === 'function') {
        win.__clickspec_record_event__(payload);
      }
    } catch (e) {
      // Ignore disconnects during page reload
    }
  }

  // Attach document-level listeners once per Document object
  if (!doc.__clickspec_doc_initialized__) {
    doc.__clickspec_doc_initialized__ = true;

    // 1. Capture Click Events
    doc.addEventListener(
      'click',
      function (evt) {
        try {
          const target = (evt.target && evt.target.closest)
            ? evt.target.closest('button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [tabindex], [onclick]')
            : evt.target;

          if (!target || target === doc.body || target === doc.documentElement) {
            return;
          }

          const snapshot = snapshotElement(target);
          const isSubmit =
            target.getAttribute('type') === 'submit' ||
            target.getAttribute('role') === 'button' ||
            target.tagName.toLowerCase() === 'button';

          // Send immediate click event
          sendToBridge({
            timestamp: Date.now(),
            type: 'click',
            url: win.location.href,
            element: snapshot,
          });

          // Smart Assertion Hook: If submit or high-signal button, capture newly rendered DOM elements
          if (isSubmit) {
            setTimeout(function () {
              const mutations = captureHighSignalMutations();
              if (mutations.length > 0) {
                sendToBridge({
                  timestamp: Date.now(),
                  type: 'state_mutation',
                  url: win.location.href,
                  assertionCandidates: mutations,
                });
              }
            }, 400);
          }
        } catch (err) {
          // Guard against page unloads
        }
      },
      true
    );

    // 2. Capture Input Events
    doc.addEventListener(
      'input',
      function (evt) {
        try {
          const target = evt.target;
          if (!target || !target.tagName) return;

          const snapshot = snapshotElement(target);
          sendToBridge({
            timestamp: Date.now(),
            type: 'input',
            url: win.location.href,
            element: snapshot,
            inputValue: target.value,
          });
        } catch (err) {
          // Ignore
        }
      },
      true
    );

    // 3. Capture Change Events (committed values)
    doc.addEventListener(
      'change',
      function (evt) {
        try {
          const target = evt.target;
          if (!target || !target.tagName) return;

          const snapshot = snapshotElement(target);
          sendToBridge({
            timestamp: Date.now(),
            type: 'change',
            url: win.location.href,
            element: snapshot,
            inputValue: target.value,
          });
        } catch (err) {
          // Ignore
        }
      },
      true
    );
  }

  // Attach window-level navigation listeners once per Window object
  if (!win.__clickspec_win_initialized__) {
    win.__clickspec_win_initialized__ = true;

    function notifyNavigation(newUrl) {
      sendToBridge({
        timestamp: Date.now(),
        type: 'navigation',
        url: newUrl,
        navigationUrl: newUrl,
      });

      // After SPA navigation, check for headings / alerts
      setTimeout(function () {
        const mutations = captureHighSignalMutations();
        if (mutations.length > 0) {
          sendToBridge({
            timestamp: Date.now(),
            type: 'state_mutation',
            url: win.location.href,
            assertionCandidates: mutations,
          });
        }
      }, 300);
    }

    win.addEventListener('popstate', function () {
      notifyNavigation(win.location.href);
    });
    win.addEventListener('hashchange', function () {
      notifyNavigation(win.location.href);
    });

    const originalPushState = history.pushState;
    history.pushState = function () {
      originalPushState.apply(this, arguments);
      notifyNavigation(win.location.href);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      notifyNavigation(win.location.href);
    };
  }
})();
`;

export class InteractionRecorder {
  private page: Page;
  private options: RecorderOptions;
  private recordedEvents: RecordedEvent[] = [];
  private eventCounter = 0;

  constructor(page: Page, options: RecorderOptions = {}) {
    this.page = page;
    this.options = options;
  }

  public async setup(): Promise<void> {
    // Expose binding to bridge client-side DOM events to Node.js
    await this.page.exposeFunction(
      '__clickspec_record_event__',
      (rawEvent: Omit<RecordedEvent, 'id'>) => {
        const event: RecordedEvent = {
          ...rawEvent,
          id: `evt_${++this.eventCounter}_${Date.now()}`,
        };
        this.recordedEvents.push(event);
        if (this.options.onEvent) {
          this.options.onEvent(event);
        }
      }
    );

    // Listen to hard frame navigations directly from Playwright
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) {
        const url = frame.url();
        // Avoid duplicate logging of about:blank
        if (url && url !== 'about:blank') {
          const navEvent: RecordedEvent = {
            id: `evt_${++this.eventCounter}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'navigation',
            url,
            navigationUrl: url,
          };
          this.recordedEvents.push(navEvent);
          if (this.options.onEvent) {
            this.options.onEvent(navEvent);
          }
        }
      }
    });

    // Listen to dialog events (alert, confirm, prompt)
    this.page.on('dialog', async (dialog) => {
      const dialogEvent: RecordedEvent = {
        id: `evt_${++this.eventCounter}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'state_mutation',
        url: this.page.url(),
        assertionCandidates: [
          {
            kind: 'toast_or_alert',
            description: `Dialog (${dialog.type()}): "${dialog.message()}"`,
            expectedValue: dialog.message(),
          },
        ],
      };
      this.recordedEvents.push(dialogEvent);
      if (this.options.onEvent) {
        this.options.onEvent(dialogEvent);
      }
    });

    // Inject in-page observer script on every navigation/frame via addInitScript
    await this.page.addInitScript(IN_PAGE_OBSERVER_CODE);

    // Also attach on page load / domcontentloaded events (handles setContent or dynamic updates)
    this.page.on('domcontentloaded', () => {
      this.page.evaluate(IN_PAGE_OBSERVER_CODE).catch(() => {});
    });
    this.page.on('load', () => {
      this.page.evaluate(IN_PAGE_OBSERVER_CODE).catch(() => {});
    });

    // Evaluate immediately on initial page
    await this.inject();
  }

  public async inject(): Promise<void> {
    try {
      await this.page.evaluate(IN_PAGE_OBSERVER_CODE);
    } catch {
      // Ignore if page is in midst of navigating
    }
  }

  public getRecordedEvents(): RecordedEvent[] {
    return [...this.recordedEvents];
  }

  public clear(): void {
    this.recordedEvents = [];
    this.eventCounter = 0;
  }
}
