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

export const COUNTRY_LIST = ["日本 (Japan)", "美國 (USA)", "韓國 (South Korea)", "台灣 (Taiwan)", "泰國 (Thailand)"];
