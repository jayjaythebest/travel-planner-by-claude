import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CURRENCY_MAP: Record<string, string> = {
  "日本 (Japan)": "JPY",
  "美國 (USA)": "USD",
  "韓國 (South Korea)": "KRW",
  "台灣 (Taiwan)": "TWD",
  "泰國 (Thailand)": "THB",
};

/**
 * Destination time zones, keyed the same way CURRENCY_MAP is.
 *
 * Times in this app are local to where the trip is, so a Calendar event has to
 * say which zone its naive "09:00" belongs to. USA is a deliberate
 * approximation - the country spans six zones and this app has one country
 * field, so an America/New_York trip is right and a Los Angeles one is three
 * hours off until the trip model grows a real zone.
 */
export const TIMEZONE_MAP: Record<string, string> = {
  "日本 (Japan)": "Asia/Tokyo",
  "美國 (USA)": "America/New_York",
  "韓國 (South Korea)": "Asia/Seoul",
  "台灣 (Taiwan)": "Asia/Taipei",
  "泰國 (Thailand)": "Asia/Bangkok",
};

/**
 * Zones offered for a flight's departure and arrival.
 *
 * Deliberately wider than TIMEZONE_MAP: that map answers "where is this trip",
 * one zone per country, while a flight has two ends and one of them is usually
 * home. Los Angeles is here for the same reason it cannot be in TIMEZONE_MAP —
 * a US flight can land in either zone and only the person booking it knows.
 */
export const TIME_ZONE_OPTIONS: { label: string; value: string }[] = [
  { label: "台北 (UTC+8)", value: "Asia/Taipei" },
  { label: "東京 (UTC+9)", value: "Asia/Tokyo" },
  { label: "首爾 (UTC+9)", value: "Asia/Seoul" },
  { label: "曼谷 (UTC+7)", value: "Asia/Bangkok" },
  { label: "紐約 (UTC-5/-4)", value: "America/New_York" },
  { label: "洛杉磯 (UTC-8/-7)", value: "America/Los_Angeles" },
];

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

export const COUNTRY_LIST = ["日本 (Japan)", "美國 (USA)", "韓國 (South Korea)", "台灣 (Taiwan)", "泰國 (Thailand)"];
