import React, { useMemo, useRef, useState } from 'react';
import {
  Upload, Loader2, Check, Shuffle, Plus, X as XIcon, EyeOff, Footprints, Utensils, MapPin, Route, ChevronDown, Trash2, Link2Off, TrainFront,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Trip, Activity, RecapVisit } from '../types';
import { cn, TIMEZONE_MAP } from '../utils';
import { t, useLang, getLang } from '../i18n';
import { CATEGORY_META } from './IdeaStash';
import { parseTimeline, tripStops, placeInfo, pool, compareDay, isFood, isBackground, dayKm, clean, RecapDay, RecapItem } from '../services/recap';

type Recap = NonNullable<Trip['recap']>;

const metaOf = (c: RecapVisit['category']) =>
  c === 'transit' ? { icon: TrainFront, label: '交通', chip: 'bg-zinc-100 text-zinc-500' } : CATEGORY_META[c] || CATEGORY_META.other;

/**
 * 旅行回顧: what the travellers actually did, read from Google Maps Timeline
 * exports and laid beside the plan. Each member imports their own file; a
 * re-import replaces only that member's stops and keeps the hand-made
 * pairings and hidden flags of stops that come back.
 */
export function TripRecap({
  trip,
  dates,
  activities,
  uid,
  onSave,
  onJumpToDay,
}: {
  trip: Trip;
  dates: string[];
  activities: Activity[];
  uid: string;
  onSave: (update: (prev: Recap) => Recap) => Promise<void>;
  onJumpToDay: (date: string) => void;
}) {
  useLang();
  const visits = trip.recap?.visits ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(visits.length === 0);

  const days = useMemo(() => dates.map(d => compareDay(d, activities, visits)), [dates, activities, visits]);

  const tz = TIMEZONE_MAP[trip.country] || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const importFiles = async (files: FileList) => {
    setError(null);
    setBusy(t('讀取檔案…'));
    try {
      const raw = [];
      for (const f of Array.from(files)) {
        try {
          raw.push(...parseTimeline(JSON.parse(await f.text())));
        } catch {
          throw new Error(t('「{name}」不是看得懂的時間軸檔案。請匯出 Google 地圖的時間軸 JSON。', { name: f.name }));
        }
      }
      const stops = tripStops(raw, { start: trip.start_date, end: trip.end_date }, tz);
      if (!stops.length) throw new Error(t('檔案裡沒有 {a} – {b} 之間的停留點。', { a: trip.start_date, b: trip.end_date }));

      const known = new Map(visits.filter(v => v.place_id).map(v => [v.place_id!, v]));
      const ids = [...new Set(stops.map(s => s.raw.place_id).filter((p): p is string => !!p && !known.has(p)))];
      let done = 0;
      const looked = new Map<string, Awaited<ReturnType<typeof placeInfo>>>();
      await pool(ids, 6, async id => {
        looked.set(id, await placeInfo(id, getLang()));
        setBusy(t('查詢地點名稱 {n}／{total}', { n: ++done, total: ids.length }));
      });

      const mine: RecapVisit[] = stops.map(s => {
        const r = s.raw;
        const k = r.place_id ? known.get(r.place_id) : undefined;
        const p = r.place_id ? looked.get(r.place_id) : undefined;
        return clean({
          id: s.id,
          date: s.date,
          start: s.start,
          end: s.end,
          name: k?.name || p?.name || r.name || r.address || t('未知地點'),
          address: k?.address || p?.address || r.address,
          lat: r.lat ?? p?.lat,
          lng: r.lng ?? p?.lng,
          place_id: r.place_id,
          maps_url: k?.maps_url || p?.maps_url,
          category: k?.category || p?.category || 'other',
          by: uid,
        });
      });

      await onSave(prev => {
        const old = new Map(prev.visits.map(v => [v.id, v]));
        const others = prev.visits.filter(v => v.by !== uid);
        // Two travellers who were together both have the stop; keep the first one imported.
        const dup = (v: RecapVisit) =>
          others.some(o => o.date === v.date && o.place_id && o.place_id === v.place_id && o.start < v.end && v.start < o.end);
        const merged = mine
          .filter(v => !dup(v))
          .map(v => {
            const o = old.get(v.id);
            return o ? clean({ ...v, activity_id: o.activity_id, hidden: o.hidden }) : v;
          });
        return { visits: [...others, ...merged], imported: { ...prev.imported, [uid]: new Date().toISOString() } };
      });
      setHelpOpen(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const patchVisit = (id: string, patch: Partial<RecapVisit>) =>
    onSave(prev => ({ ...prev, visits: prev.visits.map(v => (v.id === id ? clean({ ...v, ...patch }) : v)) }));

  const removeMine = () => {
    if (!confirm(t('刪除你匯入的所有足跡？其他旅伴匯入的不受影響。'))) return;
    onSave(prev => {
      const { [uid]: _, ...imported } = prev.imported;
      return { visits: prev.visits.filter(v => v.by !== uid), imported };
    });
  };

  // ── Totals ──
  const shown = visits.filter(v => !v.hidden && !isBackground(v));
  const places = new Set(shown.map(v => v.place_id || v.id)).size;
  const food = shown.filter(v => isFood(v.category)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const counted = days.filter(d => d.hasData).flatMap(d => d.items);
  const n = (k: RecapItem['kind']) => counted.filter(i => i.kind === k).length;
  const planTotal = n('done') + n('swapped') + n('skipped');
  const km = days.reduce((s, d) => s + dayKm(visits.filter(v => v.date === d.date && !v.hidden)), 0);
  const hiddenCount = visits.filter(v => v.hidden).length;
  const mineCount = visits.filter(v => v.by === uid).length;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-zinc-200 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-500 flex items-center gap-1.5"><Footprints size={12} />{t('實際足跡')}</span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-zinc-900 text-white flex items-center gap-1.5 disabled:opacity-60"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            {busy || (mineCount ? t('重新匯入時間軸') : t('匯入 Google 地圖時間軸'))}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={e => e.target.files?.length && importFiles(e.target.files)}
          />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        {visits.length > 0 && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat icon={<MapPin size={11} />} value={String(places)} label={t('個地方')} />
            <Stat icon={<Utensils size={11} />} value={String(new Set(food.map(v => v.place_id || v.id)).size)} label={t('家餐廳')} />
            <Stat icon={<Check size={11} />} value={planTotal ? `${Math.round((n('done') / planTotal) * 100)}%` : '–'} label={t('照計畫')} />
            <Stat icon={<Route size={11} />} value={km >= 10 ? String(Math.round(km)) : km.toFixed(1)} label={t('公里（直線）')} />
          </div>
        )}

        <button onClick={() => setHelpOpen(o => !o)} className="text-[11px] text-zinc-500 flex items-center gap-1">
          <ChevronDown size={11} className={cn('transition-transform', helpOpen && 'rotate-180')} />
          {t('怎麼匯出時間軸？')}
        </button>
        {helpOpen && (
          <div className="text-[11px] text-zinc-600 leading-relaxed space-y-1.5 bg-zinc-50 rounded-xl p-3">
            <p><b>Android</b>：{t('設定 → 位置 → 位置資訊服務 → 時間軸 → 匯出時間軸資料，存成 Timeline.json。')}</p>
            <p><b>iPhone</b>：{t('Google 地圖 App → 右上頭像 → 你的時間軸 → 右上 ⋯ → 位置和隱私設定 → 匯出時間軸資料。')}</p>
            <p>{t('舊的 Google Takeout「Semantic Location History」每月檔案也可以，一次選多個。')}</p>
            <p className="text-zinc-400">{t('檔案只在這個瀏覽器裡解析：只留下旅行日期內的停留點，移動路徑、住家與公司都不會上傳。')}</p>
          </div>
        )}
      </div>

      {visits.length > 0 && days.map((d, i) => (
        <DayCard
          key={d.date}
          day={d}
          index={i}
          activities={activities}
          km={dayKm(visits.filter(v => v.date === d.date && !v.hidden))}
          onJump={() => onJumpToDay(d.date)}
          onPatch={patchVisit}
        />
      ))}

      {food.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-3">
          <p className="text-xs font-bold text-zinc-500 flex items-center gap-1.5 mb-2"><Utensils size={12} />{t('這趟吃了什麼')}</p>
          <div className="space-y-1">
            {food.map(v => {
              const M = metaOf(v.category);
              return (
                <div key={v.id} className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] text-zinc-400 tabular-nums w-16 flex-shrink-0">{format(parseISO(v.date), 'M/d')} {v.start}</span>
                  <M.icon size={11} className="text-zinc-400 flex-shrink-0" />
                  <PlaceName v={v} className="truncate flex-1" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visits.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center text-[11px] text-zinc-400">
          {hiddenCount > 0 && (
            <button onClick={() => onSave(prev => ({ ...prev, visits: prev.visits.map(v => clean({ ...v, hidden: undefined })) }))} className="hover:text-zinc-700">
              {t('還原 {n} 個隱藏的地點', { n: hiddenCount })}
            </button>
          )}
          {mineCount > 0 && (
            <button onClick={removeMine} className="hover:text-red-600 flex items-center gap-1"><Trash2 size={10} />{t('刪除我匯入的足跡')}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="bg-zinc-50 rounded-xl py-2">
      <p className="text-base font-black text-zinc-900 tabular-nums">{value}</p>
      <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-0.5">{icon}{label}</p>
    </div>
  );
}

function PlaceName({ v, className }: { v: RecapVisit; className?: string }) {
  return v.maps_url ? (
    <a href={v.maps_url} target="_blank" rel="noopener noreferrer" className={cn('hover:text-sky-700 hover:underline', className)}>{v.name}</a>
  ) : (
    <span className={className}>{v.name}</span>
  );
}

const KIND_STYLE: Record<RecapItem['kind'], { icon: typeof Check; tone: string; label: string }> = {
  done: { icon: Check, tone: 'bg-emerald-100 text-emerald-700', label: '照計畫' },
  swapped: { icon: Shuffle, tone: 'bg-amber-100 text-amber-700', label: '改去這裡' },
  extra: { icon: Plus, tone: 'bg-sky-100 text-sky-700', label: '臨時加入' },
  skipped: { icon: XIcon, tone: 'bg-zinc-100 text-zinc-400', label: '沒去' },
};

const minsOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function DayCard({
  day,
  index,
  activities,
  km,
  onJump,
  onPatch,
}: {
  day: RecapDay;
  index: number;
  activities: Activity[];
  km: number;
  onJump: () => void;
  onPatch: (id: string, patch: Partial<RecapVisit>) => Promise<void>;
}) {
  const unpaired = day.items.filter((i): i is Extract<RecapItem, { kind: 'skipped' }> => i.kind === 'skipped').map(i => i.activity);
  const dayActs = activities.filter(a => a.date === day.date && !a.is_flight && !a.transfer_of);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-3">
      <button onClick={onJump} className="w-full flex items-baseline justify-between mb-2">
        <span className="text-sm font-black text-zinc-900">
          Day {index + 1} <span className="text-xs font-normal text-zinc-400 ml-1">{format(parseISO(day.date), 'M/d')}</span>
        </span>
        {day.hasData && km > 0.2 && <span className="text-[10px] text-zinc-400">{t('約 {km} 公里', { km: km.toFixed(1) })}</span>}
      </button>

      {!day.hasData ? (
        <p className="text-xs text-zinc-400">
          {dayActs.length ? t('這天沒有足跡資料（計畫有 {n} 個行程）', { n: dayActs.length }) : t('這天沒有足跡資料')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {day.items.map(item => {
            const S = KIND_STYLE[item.kind];
            const key = 'visit' in item ? item.visit.id : `a-${item.activity.id}`;
            const v = 'visit' in item ? item.visit : null;
            const M = v ? metaOf(v.category) : null;
            const late = item.kind === 'done' && item.activity.start_time && Math.abs(minsOf(item.visit.start) - minsOf(item.activity.start_time)) >= 45;
            return (
              <div key={key} className="flex items-start gap-2 group">
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', S.tone)} title={t(S.label)}>
                  <S.icon size={11} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[10px] text-zinc-400 tabular-nums flex-shrink-0">
                      {item.kind === 'skipped' ? item.activity.start_time : `${item.visit.start}–${item.visit.end}`}
                    </span>
                    {item.kind === 'skipped' ? (
                      <span className="text-zinc-400 line-through truncate">{item.activity.activity}</span>
                    ) : (
                      <>
                        {M && <M.icon size={11} className="text-zinc-400 flex-shrink-0" />}
                        <PlaceName v={item.visit} className="font-bold text-zinc-800 truncate" />
                      </>
                    )}
                  </div>
                  {item.kind === 'swapped' && (
                    <p className="text-[10px] text-zinc-400 truncate">{t('原訂')}：<span className="line-through">{item.activity.activity}</span></p>
                  )}
                  {late && <p className="text-[10px] text-zinc-400">{t('原訂 {time}', { time: item.activity.start_time })}</p>}
                  {item.kind === 'extra' && unpaired.length > 0 && (
                    <select
                      value=""
                      onChange={e => e.target.value && onPatch(item.visit.id, { activity_id: e.target.value })}
                      className="mt-0.5 text-[10px] text-zinc-500 bg-transparent border border-zinc-200 rounded-md px-1 py-0.5 max-w-full"
                    >
                      <option value="">{t('其實是計畫中的…')}</option>
                      {unpaired.map(a => <option key={a.id} value={a.id}>{a.start_time} {a.activity}</option>)}
                    </select>
                  )}
                </div>
                {v && (
                  <div className="flex gap-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {(item.kind === 'done' || item.kind === 'swapped') && (
                      <button onClick={() => onPatch(v.id, { activity_id: null })} title={t('不是這個行程')} className="p-1 text-zinc-400 hover:text-zinc-700">
                        <Link2Off size={11} />
                      </button>
                    )}
                    <button onClick={() => onPatch(v.id, { hidden: true })} title={t('隱藏這個地點')} className="p-1 text-zinc-400 hover:text-zinc-700">
                      <EyeOff size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {day.items.length === 0 && <p className="text-xs text-zinc-400">{t('這天只有住宿與交通的停留點')}</p>}
        </div>
      )}
    </div>
  );
}
