import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTargetUrl, NavigationError } from '../src/utils/url.js';

describe('normalizeTargetUrl', () => {
  it('should trim whitespace and surrounding quotes', () => {
    assert.equal(
      normalizeTargetUrl('  "http://localhost:3000"  '),
      'http://localhost:3000/'
    );
    assert.equal(
      normalizeTargetUrl("'https://example.com'"),
      'https://example.com/'
    );
  });

  it('should prepend http:// for localhost, 127.0.0.1, and ports', () => {
    assert.equal(normalizeTargetUrl('localhost:3000'), 'http://localhost:3000/');
    assert.equal(normalizeTargetUrl('127.0.0.1:8080/app'), 'http://127.0.0.1:8080/app');
    assert.equal(normalizeTargetUrl('localhost'), 'http://localhost/');
  });

  it('should prepend https:// for external domain names without protocol', () => {
    assert.equal(normalizeTargetUrl('example.com'), 'https://example.com/');
    assert.equal(normalizeTargetUrl('github.com/fiizam/clickspec'), 'https://github.com/fiizam/clickspec');
  });

  it('should preserve explicit http or https protocols', () => {
    assert.equal(normalizeTargetUrl('http://my-internal-server.local'), 'http://my-internal-server.local/');
    assert.equal(normalizeTargetUrl('https://my-secure-site.com'), 'https://my-secure-site.com/');
  });

  it('should throw an error for empty or invalid inputs', () => {
    assert.throws(() => normalizeTargetUrl(''), /cannot be empty/);
    assert.throws(() => normalizeTargetUrl('   '), /cannot be empty/);
    assert.throws(() => normalizeTargetUrl('http://'), /Invalid URL/);
  });
});

describe('NavigationError', () => {
  it('should classify ERR_CONNECTION_REFUSED with local server suggestion', () => {
    const rawError = new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/');
    const err = new NavigationError('http://localhost:3000', rawError);

    assert.equal(err.name, 'NavigationError');
    assert.equal(err.code, 'ERR_CONNECTION_REFUSED');
    assert.equal(err.url, 'http://localhost:3000');
    assert.match(err.friendlyMessage, /Connection refused at http:\/\/localhost:3000/);
    assert.match(err.suggestion, /local web development server/);
  });

  it('should classify ERR_NAME_NOT_RESOLVED with DNS suggestion', () => {
    const rawError = new Error('net::ERR_NAME_NOT_RESOLVED at https://non-existent-domain-12345.xyz');
    const err = new NavigationError('https://non-existent-domain-12345.xyz', rawError);

    assert.equal(err.code, 'ERR_NAME_NOT_RESOLVED');
    assert.match(err.friendlyMessage, /Domain name could not be resolved/);
    assert.match(err.suggestion, /DNS and internet connection/);
  });

  it('should classify timeout errors with server timeout suggestion', () => {
    const rawError = new Error('page.goto: Timeout 30000ms exceeded');
    const err = new NavigationError('https://slow-app.internal', rawError);

    assert.equal(err.code, 'TIMEOUT');
    assert.match(err.friendlyMessage, /Connection timed out/);
    assert.match(err.suggestion, /longer than 30 seconds/);
  });

  it('should classify SSL errors with certificate suggestion', () => {
    const rawError = new Error('net::ERR_CERT_AUTHORITY_INVALID at https://localhost:8443');
    const err = new NavigationError('https://localhost:8443', rawError);

    assert.equal(err.code, 'SSL_ERROR');
    assert.match(err.friendlyMessage, /SSL\/TLS certificate verification failed/);
    assert.match(err.suggestion, /self-signed certificate/);
  });

  it('should fallback gracefully for unknown network errors', () => {
    const rawError = new Error('Some unexpected socket reset error');
    const err = new NavigationError('https://example.com', rawError);

    assert.equal(err.code, 'UNKNOWN_NAVIGATION_ERROR');
    assert.match(err.friendlyMessage, /Could not load page/);
    assert.ok(err.suggestion.length > 0);
  });
});
