/******************************** tab-presence.ts *****************************
 *
 * Purpose: Keep several markpage tabs from editing the same document at once.
 *   Each tab edits one document; opening a document already open elsewhere
 *   points to that tab instead of opening a second, silently diverging copy.
 * How:
 *   - Presence (BroadcastChannel): every tab announces its current document
 *     and answers a newcomer's roll call, so "is this document open in another
 *     tab?" is answered synchronously — inside the click that opens it.
 *   - Lock (Web Locks): the tab that edits a document holds `markpage-doc:<uuid>`.
 *     A tab that can't get it (a duplicated tab, a URL typed by hand) is
 *     read-only until the user takes the document over (`steal`), at which
 *     point the former owner is told it lost the lock.
 *   Both degrade to "always the owner" where the APIs are missing.
 *
 *******************************************************************************/

type Message =
  | { type: 'hello'; tab: string }
  | { type: 'current'; tab: string; uuid: string | null }
  | { type: 'bye'; tab: string }
  | { type: 'focus'; uuid: string };

const CHANNEL = 'markpage-tabs';
const LOCK_PREFIX = 'markpage-doc:';

const tabId = crypto.randomUUID();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
/** Other tabs → the document each one has open. */
const others = new Map<string, string | null>();
let mine: string | null = null;
let onFocusRequest: ((uuid: string) => void) | null = null;

function post(msg: Message): void {
  channel?.postMessage(msg);
}

/**
 * Join the tab roll call. `focus` is called when another tab asks this one to
 * come forward for a document it has open.
 */
export function initTabPresence(focus: (uuid: string) => void): void {
  onFocusRequest = focus;
  if (!channel) return;
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (m.type === 'hello') {
      post({ type: 'current', tab: tabId, uuid: mine });
    } else if (m.type === 'current') {
      others.set(m.tab, m.uuid);
    } else if (m.type === 'bye') {
      others.delete(m.tab);
    } else if (m.type === 'focus' && m.uuid === mine) {
      onFocusRequest?.(m.uuid);
    }
  };
  globalThis.addEventListener('pagehide', () => post({ type: 'bye', tab: tabId }));
  post({ type: 'hello', tab: tabId });
}

/** Tell the other tabs which document this one now has open. */
export function announceCurrentDoc(uuid: string): void {
  mine = uuid;
  post({ type: 'current', tab: tabId, uuid });
}

/** Is `uuid` open in another markpage tab (as last announced)? Synchronous. */
export function isOpenElsewhere(uuid: string): boolean {
  for (const u of others.values()) if (u === uuid) return true;
  return false;
}

/**
 * Authoritative (async) check: does another tab hold `uuid`'s edit lock? The
 * browser releases a closed or crashed tab's locks, so this corrects a stale
 * presence entry (a tab that vanished without saying goodbye) — dropped here.
 */
export async function isLockedElsewhere(uuid: string): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks || held === uuid) return false;
  const snapshot = await locks.query();
  const locked = (snapshot.held ?? []).some((l) => l.name === `${LOCK_PREFIX}${uuid}`);
  if (!locked) {
    for (const [tab, u] of others) if (u === uuid) others.delete(tab);
  }
  return locked;
}

/** Ask the tab that has `uuid` open to come forward. */
export function requestFocus(uuid: string): void {
  post({ type: 'focus', uuid });
}

// ---- the edit lock -----------------------------------------------------------

let release: (() => void) | null = null;
let held: string | null = null;
// Bumped on every acquisition, so a stale request settling late is ignored.
let generation = 0;

/**
 * Take the edit lock for `uuid` (releasing the previous one). Resolves to
 * 'owner' when this tab may edit, 'busy' when another tab holds the document.
 * `onLost` fires if another tab later takes the document over.
 */
export function holdDocLock(
  uuid: string,
  onLost: () => void,
  opts: { steal?: boolean } = {},
): Promise<'owner' | 'busy'> {
  release?.();
  release = null;
  held = null;
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return Promise.resolve('owner');
  const gen = (generation += 1);
  return new Promise((resolve) => {
    const options: LockOptions = opts.steal ? { steal: true } : { ifAvailable: true };
    locks
      .request(`${LOCK_PREFIX}${uuid}`, options, (lock) => {
        if (!lock || gen !== generation) {
          resolve('busy');
          return undefined;
        }
        held = uuid;
        resolve('owner');
        // Hold until released (switching document) or stolen.
        return new Promise<void>((r) => {
          release = r;
        });
      })
      .catch(() => {
        // AbortError: another tab stole the lock.
        if (gen === generation && held === uuid) {
          held = null;
          release = null;
          onLost();
        }
      });
  });
}
