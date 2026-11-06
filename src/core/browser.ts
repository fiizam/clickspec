import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { InteractionRecorder } from './recorder.js';
import { NavigationError, normalizeTargetUrl } from '../utils/url.js';
import type { BrowserSessionOptions, RecordedEvent } from '../types.js';

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private recorder: InteractionRecorder | null = null;
  private options: BrowserSessionOptions;
  private isFinished = false;
  private isAuthSaved = false;
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
    const isMobile = Boolean(this.options.mobile || this.options.deviceName);
    const selectedDeviceName = this.options.deviceName || (isMobile ? 'Pixel 7' : undefined);
    const devicePreset = selectedDeviceName ? devices[selectedDeviceName] || devices['Pixel 7'] : null;

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ];

    if (devicePreset && devicePreset.viewport) {
      // In mobile emulation, set a mobile phone window size with standard frame padding
      const winW = devicePreset.viewport.width + 100;
      const winH = devicePreset.viewport.height + 150;
      launchArgs.push(`--window-size=${winW},${winH}`);
    } else {
      launchArgs.push('--start-maximized');
    }

    try {
      this.browser = await chromium.launch({
        headless: this.options.headless ?? false,
        args: launchArgs,
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

    const contextOptions: Parameters<Browser['newContext']>[0] = devicePreset
      ? { ...devicePreset }
      : {
          viewport: this.options.viewport ?? { width: 1280, height: 800 },
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 clickspec/1.0',
        };

    if (this.options.auth) {
      const resolvedAuth = path.resolve(this.options.auth);
      if (!fs.existsSync(resolvedAuth)) {
        throw new Error(`Authentication state file not found at: ${resolvedAuth}`);
      }
      contextOptions.storageState = resolvedAuth;
    }

    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();

    this.recorder = new InteractionRecorder(this.page, {
      onEvent: this.options.onEvent,
    });

    await this.recorder.setup();

    // Listen for browser / window close by user
    this.page.on('close', async () => {
      await this.persistAuthState();
      this.handleBrowserClosed();
    });

    this.browser.on('disconnected', async () => {
      await this.persistAuthState();
      this.handleBrowserClosed();
    });
  }

  private async persistAuthState(): Promise<void> {
    if (!this.options.saveAuth || this.isAuthSaved || !this.context) {
      return;
    }
    try {
      const resolvedPath = path.resolve(this.options.saveAuth);
      const parentDir = path.dirname(resolvedPath);
      await fs.promises.mkdir(parentDir, { recursive: true });
      await this.context.storageState({ path: resolvedPath });
      this.isAuthSaved = true;
    } catch {
      // Ignore if context or page is already closed or shutting down
    }
  }

  public async navigate(url: string): Promise<{ status?: number; warning?: string }> {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Browser page is closed or not initialized.');
    }

    const validUrl = normalizeTargetUrl(url);

    try {
      const response = await this.page.goto(validUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      if (response) {
        const status = response.status();
        if (status >= 400) {
          const warning = `Server returned HTTP ${status} for ${validUrl}`;
          return { status, warning };
        }
        return { status };
      }
      return {};
    } catch (err: unknown) {
      if (err instanceof NavigationError) {
        throw err;
      }
      throw new NavigationError(validUrl, err);
    }
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

    await this.persistAuthState();

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

  public hasSavedAuth(): boolean {
    return this.isAuthSaved;
  }
}

