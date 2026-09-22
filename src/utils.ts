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

export const COUNTRY_LIST = ["日本 (Japan)", "美國 (USA)", "韓國 (South Korea)", "台灣 (Taiwan)", "泰國 (Thailand)"];
