/**
 * URL normalization, validation, and structured navigation error classification.
 */

export class NavigationError extends Error {
  public readonly url: string;
  public readonly code: string;
  public readonly friendlyMessage: string;
  public readonly suggestion: string;

  constructor(url: string, rawError: unknown) {
    const rawMessage = rawError instanceof Error ? rawError.message : String(rawError);
    let code = 'UNKNOWN_NAVIGATION_ERROR';
    let friendlyMessage = `Could not load page at ${url}`;
    let suggestion = 'Please check if the URL is correct and your server or network is reachable.';

    if (rawMessage.includes('ERR_CONNECTION_REFUSED')) {
      code = 'ERR_CONNECTION_REFUSED';
      friendlyMessage = `Connection refused at ${url}`;
      suggestion =
        url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')
          ? 'Make sure your local web development server is running and listening on the specified port.'
          : 'The target server rejected the connection. Verify that the server is online and port is correct.';
    } else if (rawMessage.includes('ERR_NAME_NOT_RESOLVED')) {
      code = 'ERR_NAME_NOT_RESOLVED';
      friendlyMessage = `Domain name could not be resolved: ${url}`;
      suggestion = 'Check the domain name for typos, or verify your DNS and internet connection.';
    } else if (
      rawMessage.includes('ERR_CONNECTION_TIMED_OUT') ||
      rawMessage.includes('Timeout') ||
      rawMessage.includes('timeout')
    ) {
      code = 'TIMEOUT';
      friendlyMessage = `Connection timed out while loading ${url}`;
      suggestion = 'The server took longer than 30 seconds to respond. Check if the server is reachable or overloaded.';
    } else if (rawMessage.includes('ERR_INTERNET_DISCONNECTED')) {
      code = 'ERR_INTERNET_DISCONNECTED';
      friendlyMessage = `No internet connection detected while reaching ${url}`;
      suggestion = 'Please check your local Wi-Fi, Ethernet, or proxy settings.';
    } else if (rawMessage.includes('ERR_CERT_') || rawMessage.includes('ERR_SSL_')) {
      code = 'SSL_ERROR';
      friendlyMessage = `SSL/TLS certificate verification failed for ${url}`;
      suggestion = 'The site may have an invalid or self-signed certificate. For local HTTPS testing, ensure your cert is trusted.';
    }

    super(`${friendlyMessage}. ${suggestion}`);
    this.name = 'NavigationError';
    this.url = url;
    this.code = code;
    this.friendlyMessage = friendlyMessage;
    this.suggestion = suggestion;
  }
}

/**
 * Strips surrounding quotes, trims whitespace, prepends appropriate protocol (http for localhost, https for domains),
 * and validates URL syntax.
 */
export function normalizeTargetUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Target URL cannot be empty.');
  }

  // Strip single/double quotes and whitespace (common copy-paste artifact)
  let cleaned = input.trim().replace(/^['"]+|['"]+$/g, '').trim();

  if (!cleaned) {
    throw new Error('Target URL cannot be empty.');
  }

  // Prepend protocol if missing
  if (!/^https?:\/\//i.test(cleaned)) {
    const isLocalhost =
      /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/.*)?$/i.test(cleaned) ||
      /^:\d+/.test(cleaned);

    if (isLocalhost) {
      cleaned = `http://${cleaned}`;
    } else {
      cleaned = `https://${cleaned}`;
    }
  }

  try {
    const parsed = new URL(cleaned);
    if (!parsed.protocol || !parsed.host) {
      throw new Error('Malformed URL host or protocol');
    }
    return parsed.toString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid URL "${input}": ${msg}`);
  }
}
