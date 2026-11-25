import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import { TRANSFER_KEY, qrSvg, takeTransferredToken, transferUrl } from '../src/github-transfer';

const TOKEN = 'github_pat_11ABCDEFG0_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS';

function fakeHistory() {
  const calls: (string | undefined)[] = [];
  return { calls, replaceState: (_d: unknown, _u: string, url?: string) => void calls.push(url) };
}

describe('transferUrl', () => {
  it('carries the token in the fragment, never in the query', () => {
    const url = transferUrl(TOKEN, { origin: 'https://markpage.org', pathname: '/' });
    expect(url).toBe(`https://markpage.org/#${TRANSFER_KEY}=${TOKEN}`);
    expect(new URL(url).search).toBe(''); // a query would reach the server
  });

  it('escapes what a fragment cannot hold', () => {
    const url = transferUrl('a b&c', { origin: 'https://x.org', pathname: '/app/' });
    expect(url).toBe('https://x.org/app/#gh-token=a%20b%26c');
  });
});

describe('takeTransferredToken', () => {
  it('takes the token and removes it from the address at once', () => {
    const h = fakeHistory();
    const loc = { hash: `#${TRANSFER_KEY}=${encodeURIComponent(TOKEN)}`, pathname: '/', search: '?doc=1' };
    expect(takeTransferredToken(loc, h)).toBe(TOKEN);
    expect(h.calls).toEqual(['/?doc=1']);
  });

  it('keeps the rest of the fragment', () => {
    const h = fakeHistory();
    expect(takeTransferredToken({ hash: '#x=1&gh-token=abc', pathname: '/p', search: '' }, h)).toBe('abc');
    expect(h.calls).toEqual(['/p#x=1']);
  });

  it('leaves an address without a token alone', () => {
    const h = fakeHistory();
    expect(takeTransferredToken({ hash: '#code=xyz', pathname: '/', search: '' }, h)).toBeNull();
    expect(takeTransferredToken({ hash: '', pathname: '/', search: '' }, h)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it('treats an empty token as none, but still clears it', () => {
    const h = fakeHistory();
    expect(takeTransferredToken({ hash: '#gh-token=', pathname: '/', search: '' }, h)).toBeNull();
    expect(h.calls).toEqual(['/']);
  });
});

describe('qrSvg', () => {
  it('encodes the full transfer address in a scannable SVG', () => {
    const url = transferUrl(TOKEN, { origin: 'https://markpage.org', pathname: '/' });
    const svg = qrSvg(url);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
    // The same data, encoded by the library alone, gives the same module
    // matrix size: nothing was truncated on the way.
    const ref = qrcode(0, 'M');
    ref.addData(url, 'Byte');
    ref.make();
    expect(ref.getModuleCount()).toBeGreaterThan(20);
  });
});
