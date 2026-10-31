import type {
  RecordedEvent,
  NormalizedEvent,
  InteractionSequence,
  DOMElementSnapshot,
  AssertionCandidate,
} from '../types.js';

export interface NormalizerOptions {
  inputDebounceMs?: number;
  clickDedupeMs?: number;
}

export class EventNormalizer {
  private readonly inputDebounceMs: number;
  private readonly clickDedupeMs: number;

  constructor(options: NormalizerOptions = {}) {
    this.inputDebounceMs = options.inputDebounceMs ?? 800;
    this.clickDedupeMs = options.clickDedupeMs ?? 250;
  }

  public normalize(
    rawEvents: RecordedEvent[],
    initialUrl: string,
    metadataOverrides: Partial<InteractionSequence['metadata']> = {}
  ): InteractionSequence {
    if (rawEvents.length === 0) {
      return {
        initialUrl,
        startedAt: Date.now(),
        endedAt: Date.now(),
        events: [],
        metadata: {
          totalRawEvents: 0,
          normalizedCount: 0,
          ...metadataOverrides,
        },
      };
    }

    const sorted = [...rawEvents].sort((a, b) => a.timestamp - b.timestamp);
    const startedAt = sorted[0].timestamp;
    const endedAt = sorted[sorted.length - 1].timestamp;

    const normalized: NormalizedEvent[] = [];
    let currentInputTargetKey: string | null = null;
    let pendingInputEvent: {
      raw: RecordedEvent;
      target: DOMElementSnapshot;
      lastValue: string;
      firstTimestamp: number;
    } | null = null;

    const flushPendingInput = () => {
      if (!pendingInputEvent) return;

      const { raw, target, lastValue } = pendingInputEvent;
      const targetLabel =
        target.ariaLabel ||
        target.placeholder ||
        target.name ||
        target.id ||
        target.textContent ||
        'input field';

      normalized.push({
        id: `norm_${normalized.length + 1}`,
        action: 'fill',
        timestamp: raw.timestamp,
        url: raw.url,
        target,
        value: lastValue,
        description: `Fill ${target.role || 'textbox'} "${targetLabel}" with "${lastValue}"`,
      });

      pendingInputEvent = null;
      currentInputTargetKey = null;
    };

    function getTargetKey(el?: DOMElementSnapshot): string {
      if (!el) return 'unknown';
      return `${el.tagName}:${el.id || ''}:${el.name || ''}:${el.ariaLabel || ''}:${el.placeholder || ''}`;
    }

    let lastClickTargetKey: string | null = null;
    let lastClickTimestamp = 0;
    let lastRecordedUrl = '';

    for (const event of sorted) {
      if (event.type === 'input' || event.type === 'change') {
        const target = event.element;
        if (!target) continue;

        const key = getTargetKey(target);
        const val = event.inputValue ?? target.value ?? '';

        if (pendingInputEvent && currentInputTargetKey === key) {
          // Update the pending input value
          pendingInputEvent.lastValue = val;
        } else {
          // Flush any previously pending input on another element
          flushPendingInput();
          currentInputTargetKey = key;
          pendingInputEvent = {
            raw: event,
            target,
            lastValue: val,
            firstTimestamp: event.timestamp,
          };
        }
        continue;
      }

      // Any non-input event flushes pending typing
      flushPendingInput();

      if (event.type === 'click') {
        const target = event.element;
        if (!target) continue;

        const key = getTargetKey(target);

        // Deduplicate rapid accidental double clicks on exact same element
        if (
          key === lastClickTargetKey &&
          event.timestamp - lastClickTimestamp < this.clickDedupeMs
        ) {
          continue;
        }

        lastClickTargetKey = key;
        lastClickTimestamp = event.timestamp;

        const role = target.role || target.tagName.toLowerCase();
        const label =
          target.ariaLabel ||
          target.textContent ||
          target.placeholder ||
          target.name ||
          target.id ||
          '';

        normalized.push({
          id: `norm_${normalized.length + 1}`,
          action: 'click',
          timestamp: event.timestamp,
          url: event.url,
          target,
          description: label ? `Click ${role} "${label}"` : `Click <${target.tagName.toLowerCase()}>`,
        });
      } else if (event.type === 'navigation') {
        const targetUrl = event.navigationUrl || event.url;

        // Skip consecutive identical navigations
        if (targetUrl === lastRecordedUrl) {
          continue;
        }
        lastRecordedUrl = targetUrl;

        normalized.push({
          id: `norm_${normalized.length + 1}`,
          action: 'navigate',
          timestamp: event.timestamp,
          url: targetUrl,
          value: targetUrl,
          description: `Navigate to ${targetUrl}`,
        });
      } else if (event.type === 'state_mutation') {
        const candidates = event.assertionCandidates || [];
        if (candidates.length === 0) continue;

        // Deduplicate candidates
        const uniqueCandidates = deduplicateAssertions(candidates);

        // If there was a preceding action within 1.5 seconds, attach assertions to it
        const prevAction = normalized[normalized.length - 1];
        if (
          prevAction &&
          event.timestamp - prevAction.timestamp < 1500 &&
          (prevAction.action === 'click' || prevAction.action === 'fill')
        ) {
          prevAction.assertions = [
            ...(prevAction.assertions || []),
            ...uniqueCandidates,
          ];
        } else {
          // Otherwise emit an assertion step
          for (const c of uniqueCandidates) {
            normalized.push({
              id: `norm_${normalized.length + 1}`,
              action: 'assert',
              timestamp: event.timestamp,
              url: event.url,
              target: c.element,
              value: c.expectedValue,
              assertions: [c],
              description: `Assert: ${c.description}`,
            });
          }
        }
      }
    }

    // Flush any trailing input
    flushPendingInput();

    return {
      initialUrl,
      startedAt,
      endedAt,
      events: normalized,
      metadata: {
        totalRawEvents: rawEvents.length,
        normalizedCount: normalized.length,
        ...metadataOverrides,
      },
    };
  }
}

function deduplicateAssertions(candidates: AssertionCandidate[]): AssertionCandidate[] {
  const seen = new Set<string>();
  const result: AssertionCandidate[] = [];

  for (const c of candidates) {
    const key = `${c.kind}:${c.expectedValue || ''}:${c.element?.tagName || ''}:${c.element?.id || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  return result;
}

