/********************************* onedrive.ts *********************************
 *
 * Purpose: Upload a Markdown document to the user's OneDrive via Microsoft
 *   Graph, scoped to an app-folder so the app never sees the rest of the
 *   user's drive. Optionally returns a shareable web link.
 * How: Lazy MSAL Browser singleton (loaded only when the user clicks the
 *   menu item or returns from the OAuth redirect). Uses the *redirect* flow
 *   rather than popup — popup post-back to opener is fragile across the
 *   cross-origin auth round-trip. A pending-action marker in sessionStorage
 *   lets us resume the upload after the page comes back authenticated.
 *
 *******************************************************************************/

export interface OneDriveUploadResult {
  ok: true;
  webUrl: string;
  shareUrl?: string;
}

export interface OneDriveUploadError {
  ok: false;
  error: string;
}

// Azure AD app registration for markpage.org (Application/client ID).
// Public identifier — fine to embed; the security comes from PKCE and the
// allowlisted redirect URIs in the Azure portal. Forks should override via
// `VITE_ONEDRIVE_CLIENT_ID` to point at their own registration.
const CLIENT_ID =
  import.meta.env['VITE_ONEDRIVE_CLIENT_ID'] ??
  'a7a78205-d67d-4088-a38f-7a9d2e0b3f10';

// Personal Microsoft accounts authority. Switch to '/common' if we later
// enable the Work/School tenant in the Azure registration.
const AUTHORITY = 'https://login.microsoftonline.com/consumers';

// Files.ReadWrite.AppFolder limits the token to `Apps/markpage/` — Microsoft
// does not require app verification for this scope.
const SCOPES = ['Files.ReadWrite.AppFolder'];

// Survives the OAuth round-trip via sessionStorage so we can resume the
// pending upload action after the user comes back authenticated.
const PENDING_KEY = 'markpage:onedrive-pending';

interface PendingUpload {
  docUuid: string;
}

interface MsalApp {
  loginRedirect(req: { scopes: string[] }): Promise<void>;
  acquireTokenSilent(req: {
    scopes: string[];
    account: unknown;
  }): Promise<{ accessToken: string }>;
  acquireTokenRedirect(req: { scopes: string[] }): Promise<void>;
  getAllAccounts(): Array<unknown>;
  setActiveAccount(account: unknown): void;
  handleRedirectPromise(): Promise<{ account: unknown } | null>;
}

let msalPromise: Promise<MsalApp> | null = null;

/**
 * Purpose: Lazily import MSAL Browser and build a configured singleton.
 * How: Dynamic `import()` so the ~50 KB gzipped SDK only loads when the
 *   user explicitly triggers OneDrive interaction (or when we're returning
 *   from an OAuth redirect — see `processOAuthRedirect`).
 */
async function getMsal(): Promise<MsalApp> {
  msalPromise ??= (async () => {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const app = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await app.initialize();
    return app as unknown as MsalApp;
  })();
  return msalPromise;
}

/**
 * Purpose: On every bootstrap, process any pending OAuth redirect response
 *   and return whether the user was mid-way through a OneDrive save.
 * How: `handleRedirectPromise()` parses the URL hash and clears it; if a
 *   pending-upload marker is present in sessionStorage we return the doc
 *   UUID so bootstrap can re-trigger the upload once the app is ready.
 */
export async function processOAuthRedirect(): Promise<{
  resumeDocUuid: string | null;
}> {
  const hash = window.location.hash;
  const hasAuthResponse =
    hash.includes('code=') || hash.includes('error=');
  // Only spin up MSAL when there's actually something to process or a
  // pending action stored — keep the cold-start cheap otherwise.
  const pending = readPending();
  if (!hasAuthResponse && !pending) return { resumeDocUuid: null };
  try {
    const app = await getMsal();
    const result = await app.handleRedirectPromise();
    if (result) app.setActiveAccount(result.account);
  } catch (err) {
    console.error('MSAL redirect handling failed', err);
  }
  if (pending) clearPending();
  // Remember that an account exists so listVolumes can include the OneDrive
  // volume without loading the MSAL SDK on every browser open.
  try {
    const app = await getMsal();
    if (app.getAllAccounts().length > 0) setConnected(true);
  } catch {
    /* ignore */
  }
  return { resumeDocUuid: pending?.docUuid ?? null };
}

// ---- OneDrive as a mounted volume (docs/VOLUMES-SPEC.md) ----------------
// The app-folder (`special/approot` = Apps/markpage/) browsed/read/written via
// Microsoft Graph. Auth reuses the MSAL singleton above.

const CONNECTED_KEY = 'markpage:onedrive-connected';
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';

/** A conditional write rejected because the remote file changed (eTag clash). */
export class OneDriveConflictError extends Error {
  constructor() {
    super('OneDrive: le fichier a changé entre-temps.');
    this.name = 'OneDriveConflictError';
  }
}

/** Cheap check (no MSAL load) — is a OneDrive account connected? */
export function oneDriveConnected(): boolean {
  return localStorage.getItem(CONNECTED_KEY) === '1';
}
function setConnected(on: boolean): void {
  if (on) localStorage.setItem(CONNECTED_KEY, '1');
  else localStorage.removeItem(CONNECTED_KEY);
}

/** Mount OneDrive: sign in (redirect if needed). Sets the connected flag. */
export async function signInOneDrive(): Promise<void> {
  const app = await getMsal();
  if (app.getAllAccounts().length > 0) {
    setConnected(true);
    return;
  }
  await app.loginRedirect({ scopes: SCOPES }); // page navigates away
}

/** Unmount OneDrive (v1: forget the connected flag; the MSAL cache stays). */
export function signOutOneDrive(): void {
  setConnected(false);
}

/** A silent Graph access token, or null when no account / silent acquire fails. */
export async function getOneDriveToken(): Promise<string | null> {
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (!account) return null;
  app.setActiveAccount(account);
  try {
    return (await app.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch {
    return null;
  }
}

async function odToken(): Promise<string> {
  const token = await getOneDriveToken();
  if (!token) throw new Error('OneDrive non connecté');
  return token;
}

/** Encode an app-folder-relative path for a Graph `approot:/…:` address. */
function approotPath(path: string): string {
  const enc = path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
    .join('/');
  return enc;
}

export interface OneDriveEntry {
  name: string;
  isFolder: boolean;
}

/** List a folder within the app-folder (`''` = its root). */
export async function listOneDrive(path: string): Promise<OneDriveEntry[]> {
  const token = await odToken();
  const enc = approotPath(path);
  const url =
    enc === ''
      ? `${GRAPH}/special/approot/children`
      : `${GRAPH}/special/approot:/${enc}:/children`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Graph children ${resp.status}`);
  const j = (await resp.json()) as { value: { name: string; folder?: unknown }[] };
  return j.value.map((e) => ({ name: e.name, isFolder: e.folder != null }));
}

/** Read a text file + its eTag (the sync baseline) from the app-folder. */
export async function readOneDriveText(path: string): Promise<{ text: string; etag: string }> {
  const token = await odToken();
  const enc = approotPath(path);
  const meta = await fetch(`${GRAPH}/special/approot:/${enc}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new Error(`Graph item ${meta.status}`);
  const etag = ((await meta.json()) as { eTag?: string }).eTag ?? '';
  const resp = await fetch(`${GRAPH}/special/approot:/${enc}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Graph content ${resp.status}`);
  return { text: await resp.text(), etag };
}

/**
 * Write a text file to the app-folder. `ifMatch` (the baseline eTag) makes the
 * write conditional — a clash throws `OneDriveConflictError` (V1: overwrite +
 * conflict signal; fork is deferred). Returns the new eTag.
 */
export async function writeOneDriveText(
  path: string,
  content: string,
  ifMatch?: string,
): Promise<{ etag: string }> {
  const token = await odToken();
  const enc = approotPath(path);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'text/markdown',
  };
  if (ifMatch) headers['If-Match'] = ifMatch;
  const resp = await fetch(`${GRAPH}/special/approot:/${enc}:/content`, {
    method: 'PUT',
    headers,
    body: content,
  });
  if (resp.status === 412) throw new OneDriveConflictError();
  if (!resp.ok) throw new Error(`Graph PUT ${resp.status}: ${await resp.text()}`);
  const etag = ((await resp.json()) as { eTag?: string }).eTag ?? '';
  return { etag };
}

/**
 * Purpose: Upload `content` as `filename` into the user's OneDrive app-folder.
 *   If no auth session exists, navigate the page to Microsoft login first —
 *   the caller's flow ends there and resumes via `processOAuthRedirect` on
 *   the next page load.
 * How: Silent token first; on failure, store a pending marker so bootstrap
 *   knows to re-run the upload after auth, then `loginRedirect`.
 */
export async function uploadToOneDrive(
  filename: string,
  content: string,
  docUuid: string,
  options: { createShareLink?: boolean } = {},
): Promise<OneDriveUploadResult | OneDriveUploadError | null> {
  let token: string | null;
  try {
    token = await getTokenOrRedirect(docUuid);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  if (!token) return null; // redirecting — caller's flow ends
  // The `special/approot` folder is provisioned lazily on first access
  // for personal OneDrive accounts; touch it with a GET so the upload
  // below doesn't 404 on a fresh tenant.
  try {
    await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* network blip — the PUT below will surface the real error */
  }
  const safeName = encodeURIComponent(filename);
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${safeName}:/content`;
  let item: { id: string; webUrl: string };
  try {
    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/markdown',
      },
      body: content,
    });
    if (!resp.ok) {
      return { ok: false, error: `Graph PUT ${resp.status}: ${await resp.text()}` };
    }
    item = (await resp.json()) as { id: string; webUrl: string };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  if (!options.createShareLink) return { ok: true, webUrl: item.webUrl };
  try {
    const linkResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/createLink`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
      },
    );
    if (linkResp.ok) {
      const link = (await linkResp.json()) as { link: { webUrl: string } };
      return { ok: true, webUrl: item.webUrl, shareUrl: link.link.webUrl };
    }
  } catch {
    /* share-link is best-effort; fall through with the file URL */
  }
  return { ok: true, webUrl: item.webUrl };
}

/**
 * Purpose: Return a Graph token silently or trigger the interactive login
 *   redirect (with a pending-action marker so we can resume).
 */
async function getTokenOrRedirect(docUuid: string): Promise<string | null> {
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (account) {
    app.setActiveAccount(account);
    try {
      const r = await app.acquireTokenSilent({ scopes: SCOPES, account });
      return r.accessToken;
    } catch {
      // Silent token failed (expired, scope upgrade, etc.) — fall through
      // to the redirect flow.
    }
  }
  writePending({ docUuid });
  await app.loginRedirect({ scopes: SCOPES });
  return null; // page is navigating away
}

function readPending(): PendingUpload | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingUpload;
  } catch {
    return null;
  }
}

function writePending(p: PendingUpload): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

function clearPending(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
