// Google Calendar sync.
//
// This app has no Google identity to borrow. Login is a username/password row
// in the Firestore `users` collection, so reaching Calendar means running a
// second, unrelated OAuth flow of its own.
//
// Google Identity Services hands back an access token that lives about an hour
// and carries NO refresh token — a client-only app has nowhere safe to keep one
// — so this is a button the user presses, never a background job. Everything
// below assumes it is called from a click: requestAccessToken() opens a popup,
// and a popup without a user gesture is blocked.

import { addDays, format, parseISO } from 'date-fns';
import type { Activity, Trip } from '../types';
import { isValidTimeZone, TIMEZONE_MAP } from '../utils';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Read at module scope, never validated here. A throw at module init is what
// white-screens this app in production (see CLAUDE.md RULE 2), so an absent key
// has to stay inert until something actually asks for it.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';

/** False when VITE_GOOGLE_OAUTH_CLIENT_ID is unset — the UI hides the button. */
export function isCalendarConfigured(): boolean {
  return CLIENT_ID !== '';
}

/** Carries a message already written for the user, not a raw API error. */
export class CalendarError extends Error {}

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };

type TokenClient = {
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;

/**
 * Wait for the GIS script that index.html already started loading.
 *
 * Why it must already be in flight: requestAccessToken() opens a popup, and
 * Chrome only permits that while the click that triggered it is still the
 * active user activation. Awaiting a script *download* here spends that
 * activation, and the popup is then blocked with no error and no callback —
 * the button simply spins forever. Awaiting an already-resolved promise is a
 * microtask, which activation survives, so the fast path below costs nothing.
 *
 * The injection is a fallback for a document without the tag; it is the slow
 * path and can still lose the activation, which is why index.html carries it.
 */
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      // Let the next attempt retry rather than caching the failure forever.
      gisPromise = null;
      reject(new CalendarError('Google 登入元件載入失敗，請確認網路連線或擋廣告的擴充套件。'));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return gisPromise;
}

let tokenClient: TokenClient | null = null;
let cached: { token: string; expiresAt: number } | null = null;

/**
 * A token good for at least another minute, asking Google only when needed.
 *
 * The one-hour lifetime is the reason the sync is idempotent: a long editing
 * session will hit an expired token, and re-pressing the button has to be safe.
 */
async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new CalendarError('Google 登入元件載入失敗，請重新整理後再試。');

  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }
  const client = tokenClient;

  return new Promise<string>((resolve, reject) => {
    // Neither callback fires when the browser blocks the popup outright, and a
    // spinner with no end and no message is the worst possible report of that.
    // This is the only thing standing between a blocked popup and a button that
    // looks broken, so it must not be removed as "defensive".
    const watchdog = setTimeout(() => {
      reject(
        new CalendarError(
          'Google 授權視窗沒有出現，可能被瀏覽器封鎖了。請允許這個網站顯示彈出式視窗後再試一次。',
        ),
      );
    }, 60_000);
    const settle = <T,>(fn: (value: T) => void) => (value: T) => {
      clearTimeout(watchdog);
      fn(value);
    };
    resolve = settle(resolve);
    reject = settle(reject);

    client.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new CalendarError('Google 授權未完成，請再試一次。'));
        return;
      }
      cached = {
        token: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      };
      resolve(response.access_token);
    };
    client.error_callback = (error) => {
      // popup_closed is the user changing their mind, not a fault worth a stack.
      reject(
        new CalendarError(
          error?.type === 'popup_closed'
            ? '授權視窗被關閉，尚未同步。'
            : '無法開啟 Google 授權視窗，請確認瀏覽器沒有封鎖彈出視窗。',
        ),
      );
    };
    // An empty prompt lets Google skip the consent screen once it has been
    // granted; the first run still shows it because nothing has been granted yet.
    client.requestAccessToken({ prompt: cached ? '' : 'consent' });
  });
}

type GoogleEvent = {
  summary: string;
  description?: string;
  location?: string;
  colorId?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private: Record<string, string> };
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function addHours(time: string, hours: number): { time: string; nextDay: boolean } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + hours * 60;
  const wrapped = total % (24 * 60);
  return {
    time: `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
    nextDay: total >= 24 * 60,
  };
}

/**
 * One activity as a Calendar event.
 *
 * The times in this app are destination-local — 09:00 on a Japan trip means
 * 09:00 in Tokyo, whoever is looking at it — so every event names the trip
 * country's zone explicitly. Leaving timeZone off would make Google read the
 * naive time in the *viewer's* zone and put a Japan morning in the middle of
 * the night at home.
 *
 * Flights are the exception at both ends: an outbound leg departs from home,
 * so start and end carry their own zones when the activity has them.
 */
function buildEvent(activity: Activity, trip: Trip): GoogleEvent {
  const tripZone = TIMEZONE_MAP[trip.country] ?? 'Asia/Taipei';
  // Per-activity zones exist for flights, whose two ends are in different
  // places; everything else happens at the destination and inherits the trip's.
  const startZone = isValidTimeZone(activity.start_tz) ? activity.start_tz : tripZone;
  const endZone = isValidTimeZone(activity.end_tz) ? activity.end_tz : tripZone;
  const description = [activity.note?.trim(), activity.map_url?.trim()]
    .filter(Boolean)
    .join('\n\n');

  const base: Omit<GoogleEvent, 'start' | 'end'> = {
    summary: activity.activity,
    ...(description ? { description } : {}),
    ...(activity.is_flight ? { colorId: '9' } : {}),
    // Google's copy of the mapping. The Firestore map on the trip is the one
    // this app reads, but if that is ever lost these let a human — or a later
    // version of this function — still tell which event belongs to what.
    extendedProperties: {
      private: { travelPlannerTripId: trip.id, travelPlannerActivityId: activity.id },
    },
  };

  // A flight form takes free text and the 30-minute pickers can be skipped by
  // older rows, so a missing or malformed time is a real state, not a defect.
  // An all-day event keeps the activity visible instead of failing the sync.
  if (!TIME_RE.test(activity.start_time ?? '')) {
    return {
      ...base,
      start: { date: activity.date },
      end: { date: format(addDays(parseISO(activity.date), 1), 'yyyy-MM-dd') },
    };
  }

  let endDate = activity.date;
  let endTime = activity.end_time;

  if (!TIME_RE.test(endTime ?? '') || endTime <= activity.start_time) {
    if (activity.is_flight && TIME_RE.test(endTime ?? '')) {
      // An arrival earlier than departure is an overnight flight, which is the
      // normal shape of the long-haul legs this app is used for.
      //
      // This compares two wall clocks that may now be in different zones, which
      // only decides the day correctly while the flight does not cross the date
      // line. It holds for everything in COUNTRY_LIST reached from Taipei; a
      // US return landing the next calendar day is the case it gets wrong, and
      // fixing that needs real instants, not a comparison of naive strings.
      endDate = format(addDays(parseISO(activity.date), 1), 'yyyy-MM-dd');
    } else {
      // Same +2h the activity form defaults to, so a synced event matches what
      // the itinerary showed.
      const bumped = addHours(activity.start_time, 2);
      endTime = bumped.time;
      if (bumped.nextDay) endDate = format(addDays(parseISO(activity.date), 1), 'yyyy-MM-dd');
    }
  }

  return {
    ...base,
    start: { dateTime: `${activity.date}T${activity.start_time}:00`, timeZone: startZone },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone: endZone },
  };
}

async function callApi(
  path: string,
  init: RequestInit,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${EVENTS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return { status: 204, body: null };
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cached = null;
      throw new CalendarError('Google 授權已失效或權限不足，請再按一次同步並重新授權。');
    }
    return { status: response.status, body };
  }
  return { status: response.status, body };
}

export type SyncResult = {
  /** activity id -> Google event id. Persist this on the trip document. */
  events: Record<string, string>;
  added: number;
  updated: number;
  removed: number;
};

/**
 * Mirror a trip's activities into the user's primary calendar.
 *
 * Deliberately a full mirror rather than an append: the previous run's map says
 * what this app already put there, so an edited activity patches its own event
 * and one deleted in the app takes its event with it. Pressing the button twice
 * changes nothing the second time, which is what makes an expired token or a
 * half-finished run safe to just retry.
 */
export async function syncTripToCalendar(trip: Trip, activities: Activity[]): Promise<SyncResult> {
  if (!isCalendarConfigured()) {
    throw new CalendarError('尚未設定 VITE_GOOGLE_OAUTH_CLIENT_ID，無法連動 Google Calendar。');
  }

  const token = await getAccessToken();
  const previous = trip.gcal?.events ?? {};
  const events: Record<string, string> = {};
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const activity of activities) {
    const body = JSON.stringify(buildEvent(activity, trip));
    const existingId = previous[activity.id];

    if (existingId) {
      const patched = await callApi(`/${encodeURIComponent(existingId)}`, { method: 'PATCH', body }, token);
      if (patched.status < 300) {
        events[activity.id] = existingId;
        updated += 1;
        continue;
      }
      // 404/410 means it was deleted in Google Calendar directly. Recreating is
      // the honest reading of "the app is the source of truth"; anything else
      // leaves the itinerary and the calendar quietly disagreeing.
      if (patched.status !== 404 && patched.status !== 410) {
        throw new CalendarError(`更新「${activity.activity}」失敗（HTTP ${patched.status}）。`);
      }
    }

    const created = await callApi('', { method: 'POST', body }, token);
    const id = (created.body as { id?: string } | null)?.id;
    if (created.status >= 300 || !id) {
      throw new CalendarError(`建立「${activity.activity}」失敗（HTTP ${created.status}）。`);
    }
    events[activity.id] = id;
    added += 1;
  }

  for (const [activityId, eventId] of Object.entries(previous)) {
    if (events[activityId]) continue;
    const deleted = await callApi(`/${encodeURIComponent(eventId)}`, { method: 'DELETE' }, token);
    // Already gone is the desired end state, so 404/410 counts as success.
    if (deleted.status < 300 || deleted.status === 404 || deleted.status === 410) {
      removed += 1;
      continue;
    }
    throw new CalendarError(`移除已刪除的行程失敗（HTTP ${deleted.status}）。`);
  }

  return { events, added, updated, removed };
}
