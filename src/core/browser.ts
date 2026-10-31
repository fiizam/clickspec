import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { InteractionRecorder } from './recorder.js';
import type { BrowserSessionOptions, RecordedEvent } from '../types.js';

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private recorder: InteractionRecorder | null = null;
  private options: BrowserSessionOptions;
  private isFinished = false;
  private completionResolver: ((events: RecordedEvent[]) => void) | null = null;

  private constructor(options: BrowserSessionOptions) {
    this.options = options;
  }

  public static async launch(options: BrowserSessionOptions): Promise<BrowserSession> {
    const session = new BrowserSession(options);
    await session.initialize();
    return session;
  }

  private async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: this.options.headless ?? false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--start-maximized',
        ],
      });
    } catch (launchError: unknown) {
      const msg = launchError instanceof Error ? launchError.message : String(launchError);
      if (msg.includes('Executable doesn\'t exist') || msg.includes('playwright install')) {
        throw new Error(
          'Playwright browser binaries are not installed. Run "npx playwright install chromium" to install.'
        );
      }
      throw launchError;
    }

    const defaultViewport = this.options.viewport ?? { width: 1280, height: 800 };

    this.context = await this.browser.newContext({
      viewport: defaultViewport,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 clickspec/1.0',
    });

    this.page = await this.context.newPage();

    this.recorder = new InteractionRecorder(this.page, {
      onEvent: this.options.onEvent,
    });

    await this.recorder.setup();

    // Listen for browser / window close by user
    this.page.on('close', () => {
      this.handleBrowserClosed();
    });

    this.browser.on('disconnected', () => {
      this.handleBrowserClosed();
    });
  }

  public async navigate(url: string): Promise<void> {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Browser page is closed or not initialized.');
    }

    let validUrl = url;
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = `http://${validUrl}`;
    }

    await this.page.goto(validUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  public async waitForCompletion(): Promise<RecordedEvent[]> {
    if (this.isFinished) {
      return this.recorder?.getRecordedEvents() || [];
    }

    return new Promise<RecordedEvent[]>((resolve) => {
      this.completionResolver = resolve;
    });
  }

  public async stop(): Promise<RecordedEvent[]> {
    if (this.isFinished) {
      return this.recorder?.getRecordedEvents() || [];
    }

    const events = this.recorder?.getRecordedEvents() || [];
    this.isFinished = true;

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch {
      // Ignore cleanup error if already closed
    }

    try {
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }
    } catch {
      // Ignore cleanup error if already closed
    }

    if (this.completionResolver) {
      this.completionResolver(events);
      this.completionResolver = null;
    }

    return events;
  }

  private handleBrowserClosed(): void {
    if (this.isFinished) return;
    this.isFinished = true;

    const events = this.recorder?.getRecordedEvents() || [];
    if (this.completionResolver) {
      this.completionResolver(events);
      this.completionResolver = null;
    }
  }

  public getPage(): Page | null {
    return this.page;
  }

  public isClosed(): boolean {
    return this.isFinished;
  }
}

