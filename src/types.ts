export type RecordedEventType =
  | 'navigation'
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'state_mutation';

export interface SelectorHints {
  bestSelector?: string;
  testId?: string;
  roleSelector?: string;
  textSelector?: string;
  labelSelector?: string;
  placeholderSelector?: string;
  cssSelector?: string;
}

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMElementSnapshot {
  tagName: string;
  id?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  type?: string;
  textContent?: string;
  value?: string;
  title?: string;
  alt?: string;
  href?: string;
  selectorHints?: SelectorHints;
  position?: ElementPosition;
  isVisible?: boolean;
  attributes?: Record<string, string>;
}

export type AssertionKind =
  | 'text_visible'
  | 'url_match'
  | 'element_visible'
  | 'toast_or_alert'
  | 'heading_change';

export interface AssertionCandidate {
  kind: AssertionKind;
  description: string;
  element?: DOMElementSnapshot;
  expectedValue?: string;
  targetUrl?: string;
}

export interface RecordedEvent {
  id: string;
  timestamp: number;
  type: RecordedEventType;
  url: string;
  element?: DOMElementSnapshot;
  inputValue?: string;
  navigationUrl?: string;
  assertionCandidates?: AssertionCandidate[];
}

export type NormalizedActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'press'
  | 'select'
  | 'assert';

export interface NormalizedEvent {
  id: string;
  action: NormalizedActionType;
  timestamp: number;
  url: string;
  target?: DOMElementSnapshot;
  value?: string;
  assertions?: AssertionCandidate[];
  description: string;
}

export interface InteractionSequence {
  initialUrl: string;
  startedAt: number;
  endedAt: number;
  events: NormalizedEvent[];
  metadata: {
    totalRawEvents: number;
    normalizedCount: number;
    userAgent?: string;
    viewport?: { width: number; height: number };
    deviceName?: string;
    isMobile?: boolean;
  };
}

export interface AIProviderConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface TestSynthesisOptions {
  url: string;
  outputPath: string;
  testTitle?: string;
  modelName?: string;
  debug?: boolean;
  pom?: boolean;
  pageObjectPath?: string;
  deviceName?: string;
}

export interface TestSynthesisResult {
  success: boolean;
  code: string;
  outputPath: string;
  modelUsed: string;
  stats: {
    rawEventsCount: number;
    normalizedEventsCount: number;
    durationMs: number;
  };
  isPom?: boolean;
  pageObjectPath?: string;
  pageObjectCode?: string;
  deviceName?: string;
  error?: string;
}

export interface BrowserSessionOptions {
  targetUrl: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  onEvent?: (event: RecordedEvent) => void;
  onStatusChange?: (status: string) => void;
  mobile?: boolean;
  deviceName?: string;
}

