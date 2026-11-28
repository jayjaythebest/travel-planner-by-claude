import { Activity, RecapCategory, RecapVisit } from '../types';
import { placeCategory } from './geminiService';

/**
 * Google Maps Timeline exports, in the three shapes Google has shipped:
 *
 * - Android on-device export (`Timeline.json`): `{ semanticSegments: [...] }`,
 *   `visit.topCandidate.placeLocation.latLng` as "35.6°, 139.7°".
 * - iPhone on-device export (`location-history.json`): a bare array,
 *   `visit.topCandidate.placeLocation` as "geo:35.6,139.7", `placeID`.
 * - Old Takeout "Semantic Location History" (one file per month):
 *   `{ timelineObjects: [{ placeVisit }] }`, the only one carrying names.
 *
 * The two on-device shapes carry only a place id, so names and types come from
 * Places afterwards. Times in them keep the offset the phone had at the place,
 * which is exactly the local time wanted; Takeout's are UTC and are converted
 * with the trip's zone.
 */
export interface RawVisit {
  place_id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  start: string;
  end: string;
  level: number;
  semantic?: string;
}

const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));

function parseLatLng(s: unknown): { lat?: number; lng?: number } {
  if (typeof s !== 'string') return {};
  const m = s.replace(/^geo:/, '').match(/(-?\d+(?:\.\d+)?)\D+?(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : {};
}

function fromOnDevice(seg: any): RawVisit | null {
  const v = seg?.visit;
  const c = v?.topCandidate;
  if (!c || !seg.startTime || !seg.endTime) return null;
  const loc = typeof c.placeLocation === 'string' ? c.placeLocation : c.placeLocation?.latLng;
  return {
    place_id: c.placeId || c.placeID || undefined,
    ...parseLatLng(loc),
    start: seg.startTime,
    end: seg.endTime,
    level: Number(v.hierarchyLevel) || 0,
    semantic: c.semanticType,
  };
}

function fromTakeout(pv: any, level: number): RawVisit[] {
  const loc = pv?.location;
  const d = pv?.duration;
  if (!loc || !d) return [];
  const ts = (s: unknown, ms: unknown) => (s as string) || (ms ? new Date(Number(ms)).toISOString() : '');
  const start = ts(d.startTimestamp, d.startTimestampMs);
  const end = ts(d.endTimestamp, d.endTimestampMs);
  if (!start || !end) return [];
  const own: RawVisit = {
    place_id: loc.placeId,
    name: loc.name,
    address: loc.address,
    lat: num(loc.latitudeE7) != null ? num(loc.latitudeE7)! / 1e7 : undefined,
    lng: num(loc.longitudeE7) != null ? num(loc.longitudeE7)! / 1e7 : undefined,
    start,
    end,
    level,
    semantic: loc.semanticType,
  };
  return [own, ...(pv.childVisits || []).flatMap((c: any) => fromTakeout(c, level + 1))];
}

/** Every stop in one export file. Throws when the file is none of the known shapes. */
export function parseTimeline(json: unknown): RawVisit[] {
  const root: any = json;
  if (Array.isArray(root)) return root.map(fromOnDevice).filter(Boolean) as RawVisit[];
  if (Array.isArray(root?.semanticSegments)) return root.semanticSegments.map(fromOnDevice).filter(Boolean) as RawVisit[];
  if (Array.isArray(root?.timelineObjects)) {
    return root.timelineObjects.flatMap((o: any) => (o.placeVisit ? fromTakeout(o.placeVisit, 0) : []));
  }
  throw new Error('format');
}

/** Date and HH:mm where the stop happened. */
function localParts(iso: string, tz: string): { date: string; time: string } {
  if (/[+-]\d\d:?\d\d$/.test(iso)) return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map(p => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const SKIP_SEMANTIC = /HOME|WORK/i;

/**
 * The stops worth keeping: inside the trip's dates, at least 8 minutes, not
 * home or work. Where a stop holds a more specific one (a market and the stall
 * in it, a mall and its restaurant) the outer one is dropped — the specific
 * place is what "where did we eat" wants.
 */
export function tripStops(raw: RawVisit[], range: { start: string; end: string }, tz: string) {
  const inRange = raw.filter(v => {
    if (v.semantic && SKIP_SEMANTIC.test(v.semantic)) return false;
    if (Date.parse(v.end) - Date.parse(v.start) < 8 * 60_000) return false;
    const d = localParts(v.start, tz).date;
    return d >= range.start && d <= range.end;
  });
  const t = (s: string) => Date.parse(s);
  const kept = inRange.filter(
    v => !inRange.some(o => o !== v && o.level > v.level && t(o.start) >= t(v.start) && t(o.end) <= t(v.end)),
  );
  const seen = new Set<string>();
  return kept
    .map(v => {
      const s = localParts(v.start, tz);
      const e = localParts(v.end, tz);
      const key = v.place_id || (v.lat != null ? `${v.lat.toFixed(4)},${v.lng!.toFixed(4)}` : 'unknown');
      return { raw: v, id: `${key}@${v.start}`, date: s.date, start: s.time, end: e.date === s.date ? e.time : '23:59' };
    })
    .filter(v => (seen.has(v.id) ? false : (seen.add(v.id), true)))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

const TRANSIT = /^(airport|international_airport|train_station|transit_station|subway_station|bus_station|light_rail_station|ferry_terminal|parking)$/;

export interface PlaceInfo {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  maps_url?: string;
  category: RecapCategory;
}

/** Name and kind of one place id, in the reader's language. Null when Places does not answer. */
export async function placeInfo(placeId: string, lang: 'zh' | 'en'): Promise<PlaceInfo | null> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) return null;
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${lang === 'en' ? 'en' : 'zh-TW'}`,
    {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'displayName,formattedAddress,location,primaryType,types,googleMapsUri',
      },
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const p = await res.json();
  const types: string[] = [p.primaryType, ...(p.types || [])].filter(Boolean);
  return {
    name: p.displayName?.text || '',
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    maps_url: p.googleMapsUri,
    category: types.some(t => TRANSIT.test(t)) && !types.some(t => /restaurant|cafe|store/.test(t)) ? 'transit' : placeCategory(types),
  };
}

/** Runs `fn` over `items` with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

// ── Plan vs. what happened ──────────────────────────────────────────────

export type RecapItem =
  | { kind: 'done'; visit: RecapVisit; activity: Activity }
  | { kind: 'swapped'; visit: RecapVisit; activity: Activity }
  | { kind: 'extra'; visit: RecapVisit }
  | { kind: 'skipped'; activity: Activity };

export interface RecapDay {
  date: string;
  /** False when nobody's timeline has a stop that day, so nothing is called skipped. */
  hasData: boolean;
  items: RecapItem[];
}

/** Stops that are not the day's content: the hotel, the station on the way. */
export const isBackground = (v: RecapVisit) => v.category === 'stay' || v.category === 'transit';

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/^(早餐|午餐|晚餐|下午茶|宵夜|點心|咖啡|參觀|逛|breakfast|lunch|dinner|brunch|visit)\s*[:：@\-–]?\s*/u, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');

const GENERIC = /^(the|and|museum|museu|museo|musée|restaurant|restaurante|ristorante|cafe|café|caffè|coffee|bar|park|parc|parque|church|iglesia|basilica|cathedral|catedral|market|mercado|mercat|station|estación|hotel|plaza|plaça|tour|visit|lunch|dinner|del|las|los)$/;

/** Whether a planned activity and a stop are the same place, by name or by a Maps link holding its id. */
export function sameplace(a: Activity, v: RecapVisit): boolean {
  if (v.place_id && a.map_url?.includes(v.place_id)) return true;
  const x = norm(a.activity);
  const y = norm(v.name);
  if (x.length < 2 || y.length < 2) return false;
  if (x.includes(y) || y.includes(x)) return true;
  // "Museu Picasso" and "Picasso Museum" share the word that names the place;
  // the kind-of-place words around it are left out of the count.
  const words = (s: string) =>
    new Set(s.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !GENERIC.test(w)));
  const wa = words(a.activity);
  const wb = words(v.name);
  if (!wa.size || !wb.size) return false;
  const shared = [...wa].filter(w => wb.has(w)).length;
  return shared > 0 && shared / Math.min(wa.size, wb.size) >= 0.5;
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

function overlap(a: Activity, v: RecapVisit): number {
  if (!a.start_time) return 0;
  const as = mins(a.start_time);
  const ae = a.end_time && mins(a.end_time) > as ? mins(a.end_time) : as + 60;
  const vs = mins(v.start);
  const ve = Math.max(mins(v.end), vs + 1);
  const o = Math.min(ae, ve) - Math.max(as, vs);
  return o > 0 ? o / Math.min(ae - as, ve - vs) : 0;
}

/**
 * Pairs each day's plan with its stops. Hand-made pairings first, then the
 * same place by name, then — for what is left — a stop that took most of a
 * planned slot is read as "went somewhere else instead". Flights and
 * airport-transfer cards are not things anyone visits and are left out.
 */
export function compareDay(date: string, activities: Activity[], visits: RecapVisit[]): RecapDay {
  const planned = activities
    .filter(a => a.date === date && !a.is_flight && !a.transfer_of)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const stops = visits.filter(v => v.date === date && !v.hidden);
  const items: RecapItem[] = [];
  const usedA = new Set<string>();
  const usedV = new Set<string>();
  const pair = (kind: 'done' | 'swapped', v: RecapVisit, a: Activity) => {
    items.push({ kind, visit: v, activity: a });
    usedA.add(a.id);
    usedV.add(v.id);
  };

  for (const v of stops) {
    if (!v.activity_id) continue;
    const a = planned.find(p => p.id === v.activity_id && !usedA.has(p.id));
    if (a) pair('done', v, a);
  }
  const free = (v: RecapVisit) => !usedV.has(v.id) && v.activity_id !== null;
  for (const a of planned) {
    if (usedA.has(a.id)) continue;
    const hits = stops.filter(v => free(v) && sameplace(a, v));
    if (!hits.length) continue;
    const at = a.start_time ? mins(a.start_time) : 0;
    hits.sort((x, y) => Math.abs(mins(x.start) - at) - Math.abs(mins(y.start) - at));
    pair('done', hits[0], a);
  }
  const content = stops.filter(v => !isBackground(v));
  for (const a of planned) {
    if (usedA.has(a.id)) continue;
    const best = content
      .filter(free)
      .map(v => ({ v, o: overlap(a, v) }))
      .filter(x => x.o >= 0.5)
      .sort((x, y) => y.o - x.o)[0];
    if (best) pair('swapped', best.v, a);
  }
  const hasData = stops.length > 0;
  for (const v of content) if (!usedV.has(v.id)) items.push({ kind: 'extra', visit: v });
  if (hasData) for (const a of planned) if (!usedA.has(a.id)) items.push({ kind: 'skipped', activity: a });

  const at = (i: RecapItem) => ('visit' in i ? i.visit.start : i.activity.start_time || '99:99');
  items.sort((x, y) => at(x).localeCompare(at(y)));
  return { date, hasData, items };
}

export const isFood = (c: RecapCategory) => c === 'restaurant' || c === 'cafe' || c === 'bar';

/** Straight-line kilometres between a day's stops in order — a floor on how far the day went. */
export function dayKm(visits: RecapVisit[]): number {
  let km = 0;
  for (let i = 1; i < visits.length; i++) {
    const a = visits[i - 1];
    const b = visits[i];
    if (a.lat == null || b.lat == null) continue;
    const r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r;
    const dLng = (b.lng! - a.lng!) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return km;
}

/** Firestore rejects `undefined` fields; drop them. */
export function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
