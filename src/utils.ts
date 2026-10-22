import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Destination = {
  /** The exact string stored in `trip.country`. Changing one orphans its trips. */
  label: string;
  currency: string;
  /**
   * IANA zone for Calendar events.
   *
   * Countries that span several zones get the one their visitors usually mean.
   * USA is the worst case and stays a knowing approximation: one country field
   * cannot express six zones, so a New York trip is right and a Los Angeles one
   * is three hours off. Flights carry their own zones (see Activity.start_tz).
   */
  timeZone: string;
  /**
   * Extra strings the destination picker matches on, beyond the label itself.
   *
   * The label is 「中文 (English)」, so typing either language already works.
   * These cover the names people actually type that are in neither — "Holland"
   * for the Netherlands, "Turkey" for Türkiye — and common misspellings.
   */
  keywords?: string[];
};

/**
 * Every destination the app knows, and the single source for the three maps
 * below. They used to be three hand-kept literals, which is how a country could
 * exist in one and not the others.
 *
 * Adding a row means adding its currency to EXCHANGE_RATES as well — see the
 * note there, because a missing rate is silent rather than loud.
 */
export const DESTINATIONS: Destination[] = [
  // ── 東亞、東南亞 ──────────────────────────────────────────────
  { label: "台灣 (Taiwan)", currency: "TWD", timeZone: "Asia/Taipei" },
  { label: "日本 (Japan)", currency: "JPY", timeZone: "Asia/Tokyo" },
  { label: "韓國 (South Korea)", currency: "KRW", timeZone: "Asia/Seoul", keywords: ["korea"] },
  { label: "中國 (China)", currency: "CNY", timeZone: "Asia/Shanghai" },
  { label: "香港 (Hong Kong)", currency: "HKD", timeZone: "Asia/Hong_Kong" },
  { label: "澳門 (Macau)", currency: "MOP", timeZone: "Asia/Macau" },
  { label: "蒙古 (Mongolia)", currency: "MNT", timeZone: "Asia/Ulaanbaatar" },
  { label: "泰國 (Thailand)", currency: "THB", timeZone: "Asia/Bangkok" },
  { label: "越南 (Vietnam)", currency: "VND", timeZone: "Asia/Ho_Chi_Minh" },
  { label: "新加坡 (Singapore)", currency: "SGD", timeZone: "Asia/Singapore" },
  { label: "馬來西亞 (Malaysia)", currency: "MYR", timeZone: "Asia/Kuala_Lumpur" },
  { label: "印尼 (Indonesia)", currency: "IDR", timeZone: "Asia/Jakarta", keywords: ["bali", "峇里島"] },
  { label: "菲律賓 (Philippines)", currency: "PHP", timeZone: "Asia/Manila" },
  { label: "柬埔寨 (Cambodia)", currency: "KHR", timeZone: "Asia/Phnom_Penh", keywords: ["吳哥", "angkor"] },
  { label: "寮國 (Laos)", currency: "LAK", timeZone: "Asia/Vientiane" },
  { label: "緬甸 (Myanmar)", currency: "MMK", timeZone: "Asia/Yangon", keywords: ["burma"] },

  // ── 南亞、中東 ────────────────────────────────────────────────
  { label: "印度 (India)", currency: "INR", timeZone: "Asia/Kolkata" },
  { label: "尼泊爾 (Nepal)", currency: "NPR", timeZone: "Asia/Kathmandu" },
  { label: "斯里蘭卡 (Sri Lanka)", currency: "LKR", timeZone: "Asia/Colombo" },
  { label: "馬爾地夫 (Maldives)", currency: "MVR", timeZone: "Indian/Maldives" },
  { label: "阿聯 (UAE)", currency: "AED", timeZone: "Asia/Dubai", keywords: ["杜拜", "dubai", "abu dhabi"] },
  { label: "以色列 (Israel)", currency: "ILS", timeZone: "Asia/Jerusalem" },
  { label: "約旦 (Jordan)", currency: "JOD", timeZone: "Asia/Amman", keywords: ["petra", "佩特拉"] },
  { label: "土耳其 (Türkiye)", currency: "TRY", timeZone: "Europe/Istanbul", keywords: ["turkey", "turkiye", "伊斯坦堡"] },

  // ── 歐洲 ─────────────────────────────────────────────────────
  { label: "英國 (UK)", currency: "GBP", timeZone: "Europe/London", keywords: ["england", "britain", "倫敦"] },
  { label: "愛爾蘭 (Ireland)", currency: "EUR", timeZone: "Europe/Dublin" },
  { label: "法國 (France)", currency: "EUR", timeZone: "Europe/Paris", keywords: ["巴黎", "paris"] },
  { label: "德國 (Germany)", currency: "EUR", timeZone: "Europe/Berlin" },
  { label: "荷蘭 (Netherlands)", currency: "EUR", timeZone: "Europe/Amsterdam", keywords: ["holland", "阿姆斯特丹"] },
  { label: "比利時 (Belgium)", currency: "EUR", timeZone: "Europe/Brussels" },
  { label: "瑞士 (Switzerland)", currency: "CHF", timeZone: "Europe/Zurich" },
  { label: "奧地利 (Austria)", currency: "EUR", timeZone: "Europe/Vienna", keywords: ["維也納", "vienna"] },
  { label: "義大利 (Italy)", currency: "EUR", timeZone: "Europe/Rome", keywords: ["羅馬", "rome"] },
  { label: "西班牙 (Spain)", currency: "EUR", timeZone: "Europe/Madrid", keywords: ["巴塞隆納", "barcelona", "madrid"] },
  { label: "葡萄牙 (Portugal)", currency: "EUR", timeZone: "Europe/Lisbon", keywords: ["里斯本", "lisbon"] },
  { label: "希臘 (Greece)", currency: "EUR", timeZone: "Europe/Athens", keywords: ["聖托里尼", "santorini"] },
  { label: "克羅埃西亞 (Croatia)", currency: "EUR", timeZone: "Europe/Zagreb" },
  { label: "捷克 (Czechia)", currency: "CZK", timeZone: "Europe/Prague", keywords: ["czech", "布拉格", "prague"] },
  { label: "匈牙利 (Hungary)", currency: "HUF", timeZone: "Europe/Budapest", keywords: ["布達佩斯", "budapest"] },
  { label: "波蘭 (Poland)", currency: "PLN", timeZone: "Europe/Warsaw" },
  { label: "冰島 (Iceland)", currency: "ISK", timeZone: "Atlantic/Reykjavik" },
  { label: "挪威 (Norway)", currency: "NOK", timeZone: "Europe/Oslo" },
  { label: "瑞典 (Sweden)", currency: "SEK", timeZone: "Europe/Stockholm" },
  { label: "丹麥 (Denmark)", currency: "DKK", timeZone: "Europe/Copenhagen" },
  { label: "芬蘭 (Finland)", currency: "EUR", timeZone: "Europe/Helsinki" },

  // ── 美洲 ─────────────────────────────────────────────────────
  { label: "美國 (USA)", currency: "USD", timeZone: "America/New_York", keywords: ["america", "紐約", "new york"] },
  { label: "加拿大 (Canada)", currency: "CAD", timeZone: "America/Toronto" },
  { label: "墨西哥 (Mexico)", currency: "MXN", timeZone: "America/Mexico_City", keywords: ["坎昆", "cancun"] },
  { label: "巴西 (Brazil)", currency: "BRL", timeZone: "America/Sao_Paulo" },
  { label: "阿根廷 (Argentina)", currency: "ARS", timeZone: "America/Argentina/Buenos_Aires" },
  { label: "秘魯 (Peru)", currency: "PEN", timeZone: "America/Lima", keywords: ["馬丘比丘", "machu picchu"] },
  { label: "智利 (Chile)", currency: "CLP", timeZone: "America/Santiago" },

  // ── 大洋洲 ───────────────────────────────────────────────────
  { label: "澳洲 (Australia)", currency: "AUD", timeZone: "Australia/Sydney", keywords: ["雪梨", "sydney"] },
  { label: "紐西蘭 (New Zealand)", currency: "NZD", timeZone: "Pacific/Auckland" },
  { label: "關島 (Guam)", currency: "USD", timeZone: "Pacific/Guam" },
  { label: "帛琉 (Palau)", currency: "USD", timeZone: "Pacific/Palau" },
  { label: "斐濟 (Fiji)", currency: "FJD", timeZone: "Pacific/Fiji" },

  // ── 非洲 ─────────────────────────────────────────────────────
  { label: "坦尚尼亞 (Tanzania)", currency: "TZS", timeZone: "Africa/Dar_es_Salaam", keywords: ["尚吉巴", "zanzibar", "serengeti"] },
  { label: "肯亞 (Kenya)", currency: "KES", timeZone: "Africa/Nairobi" },
  { label: "南非 (South Africa)", currency: "ZAR", timeZone: "Africa/Johannesburg", keywords: ["開普敦", "cape town"] },
  { label: "摩洛哥 (Morocco)", currency: "MAD", timeZone: "Africa/Casablanca" },
  { label: "埃及 (Egypt)", currency: "EGP", timeZone: "Africa/Cairo" },
];

/**
 * Rough TWD per one unit, hand-maintained. Last touched 2026-09-21.
 *
 * These are approximations and always have been — nothing here fetches a rate.
 * They exist only to add up expenses in mixed currencies, where being a few
 * percent off is the same class of error as the table being a month stale.
 *
 * **Every currency in DESTINATIONS must appear here.** The lookup at the call
 * sites is `EXCHANGE_RATES[e.currency] || 1`, so a missing entry does not warn
 * or throw — it silently treats the amount as TWD. For TZS that is an 80-fold
 * overstatement of the trip total, arrived at without a single error message.
 */
export const EXCHANGE_RATES: Record<string, number> = {
  TWD: 1,
  USD: 32.5,
  JPY: 0.21,
  EUR: 35.2,
  KRW: 0.024,
  HKD: 4.15,
  GBP: 41.5,
  AUD: 21.2,
  THB: 0.9,
  VND: 0.0013,
  SGD: 24.2,
  MYR: 7.3,
  IDR: 0.002,
  PHP: 0.56,
  CNY: 4.5,
  AED: 8.85,
  TRY: 0.95,
  CHF: 36.8,
  CAD: 23.8,
  MXN: 1.75,
  NZD: 19.5,
  TZS: 0.012,
  ZAR: 1.8,
  EGP: 0.67,
  MOP: 4.03,
  MNT: 0.0095,
  KHR: 0.008,
  LAK: 0.0015,
  MMK: 0.0155,
  INR: 0.39,
  NPR: 0.24,
  LKR: 0.11,
  MVR: 2.11,
  ILS: 8.8,
  JOD: 45.8,
  CZK: 1.4,
  HUF: 0.088,
  PLN: 8.2,
  ISK: 0.235,
  NOK: 2.95,
  SEK: 3.05,
  DKK: 4.72,
  BRL: 5.9,
  ARS: 0.03,
  PEN: 8.7,
  CLP: 0.034,
  FJD: 14.4,
  KES: 0.25,
  MAD: 3.25,
};

/**
 * Every currency a destination names has a rate. Checked here rather than
 * trusted, because the failure is invisible at the call sites: they read
 * `EXCHANGE_RATES[e.currency] || 1` and a missing rate silently values the
 * amount as TWD — an 80-fold overstatement for TZS, with no error anywhere.
 *
 * Dev-only: Vite strips `import.meta.env.DEV` branches from the production
 * bundle, so this costs nothing in the deployed app and fails loudly in `npm
 * run dev` the moment someone adds a destination without its rate.
 */
if (import.meta.env.DEV) {
  const missing = DESTINATIONS.filter((d) => !(d.currency in EXCHANGE_RATES));
  if (missing.length > 0) {
    console.error(
      '[utils] 以下目的地的幣別沒有匯率，支出總額會把它們當成 TWD：',
      missing.map((d) => `${d.label} → ${d.currency}`),
    );
  }
}

export const COUNTRY_LIST: string[] = DESTINATIONS.map((d) => d.label);

export const CURRENCY_MAP: Record<string, string> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.label, d.currency]),
);

/**
 * Destination time zones, keyed the same way CURRENCY_MAP is.
 *
 * Times in this app are local to where the trip is, so a Calendar event has to
 * say which zone its naive "09:00" belongs to.
 */
export const TIMEZONE_MAP: Record<string, string> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.label, d.timeZone]),
);

/**
 * Currencies for the expense form, deduplicated.
 *
 * Not `Object.values(CURRENCY_MAP)`: five destinations share EUR, and that form
 * would render EUR five times. Sorted so the list does not reshuffle when a
 * destination is inserted.
 */
export const CURRENCY_OPTIONS: string[] = [
  ...new Set(DESTINATIONS.map((d) => d.currency)),
].sort();

/**
 * Zones offered for a flight's departure and arrival.
 *
 * Deliberately not derived from DESTINATIONS: that answers "where is this trip",
 * one zone per country, while a flight has two ends and one of them is usually
 * home. Los Angeles is here for the reason it cannot be a destination's zone —
 * a US flight can land in either zone and only the person booking it knows.
 */
export const TIME_ZONE_OPTIONS: { label: string; value: string }[] = [
  { label: "台北 (UTC+8)", value: "Asia/Taipei" },
  { label: "東京 (UTC+9)", value: "Asia/Tokyo" },
  { label: "首爾 (UTC+9)", value: "Asia/Seoul" },
  { label: "曼谷 (UTC+7)", value: "Asia/Bangkok" },
  { label: "香港 (UTC+8)", value: "Asia/Hong_Kong" },
  { label: "杜拜 (UTC+4)", value: "Asia/Dubai" },
  { label: "倫敦 (UTC+0/+1)", value: "Europe/London" },
  { label: "巴黎 (UTC+1/+2)", value: "Europe/Paris" },
  { label: "馬德里 (UTC+1/+2)", value: "Europe/Madrid" },
  { label: "新加坡 (UTC+8)", value: "Asia/Singapore" },
  { label: "紐約／波士頓 (UTC-5/-4)", value: "America/New_York" },
  { label: "芝加哥／休士頓 (UTC-6/-5)", value: "America/Chicago" },
  { label: "丹佛 (UTC-7/-6)", value: "America/Denver" },
  { label: "墨西哥城 (UTC-6)", value: "America/Mexico_City" },
  { label: "洛杉磯 (UTC-8/-7)", value: "America/Los_Angeles" },
  { label: "雪梨 (UTC+10/+11)", value: "Australia/Sydney" },
  { label: "三蘭港 (UTC+3)", value: "Africa/Dar_es_Salaam" },
];

/**
 * TIME_ZONE_OPTIONS, plus `value` when it is not one of them.
 *
 * A <select> whose value matches no option silently shows its first option —
 * which was 台北 — so a flight scanned as America/Chicago looked like Taipei
 * time while saving something else. Every valid zone gets a row instead.
 */
export function timeZoneOptionsWith(value: string): { label: string; value: string }[] {
  return !value || TIME_ZONE_OPTIONS.some(o => o.value === value)
    ? TIME_ZONE_OPTIONS
    : [...TIME_ZONE_OPTIONS, { label: value.replace(/_/g, ' '), value }];
}

/**
 * Whether a string is a time zone this browser actually knows.
 *
 * The flight scanner asks Gemini for an IANA name, and a model returning
 * "JST" or a plausible-looking invention is a normal outcome, not an odd one.
 * An unknown zone makes the Calendar API reject the whole event, so anything
 * that fails here is dropped and the trip's zone is used instead.
 */
export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The currency a trip's totals are shown in: TWD for a trip in Taiwan, USD for
 * everywhere else. Expenses keep the currency they were paid in; this only
 * decides what they are summed into.
 */
export function totalsCurrency(country: string): 'TWD' | 'USD' {
  return CURRENCY_MAP[country] === 'TWD' ? 'TWD' : 'USD';
}

/**
 * Who pays whom to settle a set of net balances (positive = is owed).
 *
 * Greedy largest-debtor-to-largest-creditor, which keeps the number of
 * transfers at most n-1. Amounts under one unit are dropped as rounding noise.
 */
export function settleUp(balances: Record<string, number>): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(balances).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }));
  const creditors = Object.entries(balances).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0.5) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v <= 0.5) i++;
    if (creditors[j].v <= 0.5) j++;
  }
  return out;
}

/** The flight number in a stored "✈️ 航班: BR198 (…)" activity, upper-cased. */
export function flightNoOf(activity: string): string | undefined {
  return activity.match(/航班:\s*([^\s(]+)/)?.[1]?.toUpperCase();
}

/**
 * Whether a flight on `date` is a way there rather than a way home: it falls in
 * the first half of the trip. Decided per flight rather than by its position in
 * the list, because travellers flying in from different cities make "the first
 * half of all flights" mean nothing.
 */
export function isOutboundDate(date: string, start: string, end: string): boolean {
  const s = Date.parse(start);
  return Date.parse(date) <= s + (Date.parse(end) - s) / 2;
}

/** Convert through EXCHANGE_RATES, which are TWD per unit. */
export function convertAmount(amount: number, from: string, to: string): number {
  return (amount * (EXCHANGE_RATES[from] || 1)) / (EXCHANGE_RATES[to] || 1);
}
