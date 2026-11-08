import React, { useEffect, useRef, useState } from 'react';
import { TrainFront, Bus, Plane, Ship, Car, Footprints, ExternalLink, Plus, Loader2, Check, RefreshCw, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../services/firebase';
import { geminiService } from '../services/geminiService';
import { Accommodation, Activity, Trip, TransportOption, TransportPlan } from '../types';
import { cn } from '../utils';
import { t } from '../i18n';

export interface TransportLeg {
  key: string;
  /** What the cached plan must have been worked out for to still count. */
  for: string;
  from: Accommodation;
  to: Accommodation;
  /** The moving day: check-in at the next hotel (check-out day when nights go unbooked between). */
  date: string;
  /** Check-out and the next check-in fall on different days, with no hotel in between. */
  gap: boolean;
  /** The itinerary entry that already gets them there: an "A → B" activity or a flight on the day. */
  covered?: Activity;
}

const LEG_RE = /→|->/;
const sameHotel = (a: Accommodation, b: Accommodation) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/**
 * Every move from one hotel to the next. Two stays in a row at the same hotel
 * (booked separately) are no move. An "A → B" activity or a flight between
 * check-out and check-in counts as the transport — the same reading the
 * reservation-agent gives a day's legs when it works out which city the
 * travellers are in.
 */
export function transportLegs(accommodations: Accommodation[], activities: Activity[]): TransportLeg[] {
  const stays = accommodations.slice().sort((a, b) => a.check_in.localeCompare(b.check_in));
  const legs: TransportLeg[] = [];
  for (let i = 0; i + 1 < stays.length; i++) {
    const from = stays[i];
    const to = stays[i + 1];
    if (sameHotel(from, to)) continue;
    const lo = from.check_out < to.check_in ? from.check_out : to.check_in;
    const hi = from.check_out < to.check_in ? to.check_in : from.check_out;
    const covered = activities
      .filter(a => a.date >= lo && a.date <= hi && (a.is_flight || LEG_RE.test(a.activity)))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))[0];
    legs.push({
      key: `${from.id}_${to.id}`,
      for: [from.name, from.address, from.check_out, to.name, to.address, to.check_in].join('|'),
      from,
      to,
      date: from.check_out < to.check_in ? from.check_out : to.check_in,
      gap: from.check_out < to.check_in,
      covered,
    });
  }
  return legs;
}

const MODE_ICON: Record<TransportOption['mode'], React.ElementType> = {
  train: TrainFront, bus: Bus, flight: Plane, ferry: Ship, car: Car, taxi: Car, walk: Footprints,
};

const hm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? t('{h} 小時 {m} 分', { h, m }) : t('{h} 小時', { h })) : t('{m} 分', { m });
};

const addMinutes = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function TransportPlanner({
  trip,
  legs,
  people,
  onSavePlan,
  onJumpToDay,
}: {
  trip: Trip;
  legs: TransportLeg[];
  people: number;
  onSavePlan: (key: string, plan: TransportPlan) => Promise<void>;
  onJumpToDay: (date: string) => void;
}) {
  const plans = trip.transport_plans ?? {};
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const asked = useRef<Set<string>>(new Set());

  const fresh = (leg: TransportLeg) => plans[leg.key]?.for === leg.for;

  const suggest = async (leg: TransportLeg) => {
    setLoading(s => new Set(s).add(leg.key));
    setFailed(s => { const n = new Set(s); n.delete(leg.key); return n; });
    try {
      const r = await geminiService.getIntercityTransport({
        from: { name: leg.from.name, address: leg.from.address },
        to: { name: leg.to.name, address: leg.to.address },
        date: leg.date,
        country: trip.country,
        people,
      });
      if (!Array.isArray(r?.options)) throw new Error('no options');
      await onSavePlan(leg.key, {
        for: leg.for,
        from_city: r.from_city || '',
        to_city: r.to_city || '',
        same_city: !!r.same_city,
        options: r.options,
        recommended: Math.min(Math.max(Number(r.recommended) || 0, 0), Math.max(r.options.length - 1, 0)),
        tip: r.tip || '',
      });
    } catch (err) {
      console.error('transport suggestion', err);
      setFailed(s => new Set(s).add(leg.key));
    } finally {
      setLoading(s => { const n = new Set(s); n.delete(leg.key); return n; });
    }
  };

  // Only moves with nothing booked yet are worth a Gemini call; one at a time,
  // each leg once per visit, and never again once a plan for it is stored.
  useEffect(() => {
    const todo = legs.filter(l => !l.covered && !fresh(l) && !asked.current.has(`${l.key}|${l.for}`));
    if (todo.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const leg of todo) {
        if (cancelled) return;
        asked.current.add(`${leg.key}|${leg.for}`);
        await suggest(leg);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs.map(l => `${l.key}|${l.for}|${l.covered?.id ?? ''}`).join(','), trip.id]);

  const addToPlan = async (leg: TransportLeg, plan: TransportPlan, opt: TransportOption, idx: number) => {
    if (adding) return;
    setAdding(`${leg.key}:${idx}`);
    try {
      const start = /^\d{1,2}:\d{2}$/.test(opt.depart) ? opt.depart.padStart(5, '0') : '11:00';
      const arrive = /^\d{1,2}:\d{2}$/.test(opt.arrive) ? opt.arrive.padStart(5, '0') : '';
      const end = arrive && arrive > start ? arrive : addMinutes(start, opt.minutes || 60);
      // "A → B" is what the reservation-agent reads as the day's leg, and
      // 航班 marks it as a flight there, so Muse books around it.
      const label = opt.mode === 'flight' ? `航班 ${opt.operator}` : opt.operator;
      await addDoc(collection(db, 'activities'), {
        id: crypto.randomUUID(),
        trip_id: trip.id,
        date: leg.date,
        start_time: start,
        end_time: end,
        activity: `${plan.from_city || leg.from.name} → ${plan.to_city || leg.to.name}（${label}）`,
        map_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${opt.from_station} ${plan.from_city}`)}`,
        note: [`${opt.from_station} → ${opt.to_station}`, opt.price, opt.book_ahead].filter(Boolean).join(' · '),
        is_flight: false,
        travel_mode: 'transit',
      });
    } catch (err) {
      console.error(err);
      alert(t('加入失敗，請再試一次。'));
    } finally {
      setAdding(null);
    }
  };

  if (legs.length === 0) {
    return (
      <p className="text-xs text-zinc-400 bg-white rounded-2xl border border-dashed border-zinc-200 p-4 text-center">
        {t('登記兩間以上的住宿後，這裡會列出每次換飯店要怎麼移動。')}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {legs.map(leg => {
        const plan = fresh(leg) ? plans[leg.key] : undefined;
        const busy = loading.has(leg.key);
        const title = plan ? `${plan.from_city} → ${plan.to_city}` : `${leg.from.name} → ${leg.to.name}`;
        const state = leg.covered
          ? { label: t('已安排交通'), chip: 'bg-emerald-100/80 text-emerald-800' }
          : plan?.same_city
            ? { label: t('同城換飯店'), chip: 'bg-zinc-100 text-zinc-600' }
            : { label: t('還沒安排交通'), chip: 'bg-amber-100/80 text-amber-800' };
        return (
          <div key={leg.key} className="bg-white rounded-2xl border border-zinc-200 p-3">
            <div className="flex items-start gap-2">
              <button
                onClick={() => onJumpToDay(leg.date)}
                className="text-center flex-shrink-0 w-10 rounded-lg bg-zinc-50 border border-zinc-100 py-1 hover:bg-zinc-100"
              >
                <div className="text-[11px] font-black text-zinc-800 tabular-nums">{format(parseISO(leg.date), 'M/d')}</div>
                <div className="text-[9px] text-zinc-400">{format(parseISO(leg.date), 'EEE')}</div>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-800 flex-1 min-w-0 truncate">{title}</span>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0', state.chip)}>{state.label}</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  {leg.from.name} <ArrowRight size={9} className="inline -mt-px" /> {leg.to.name}
                </div>
                {leg.gap && (
                  <div className="text-[10px] text-amber-700 mt-0.5">
                    {t('{out} 退房、{in} 才入住，中間的晚上還沒有住宿', {
                      out: format(parseISO(leg.from.check_out), 'M/d'),
                      in: format(parseISO(leg.to.check_in), 'M/d'),
                    })}
                  </div>
                )}
              </div>
            </div>

            {leg.covered ? (
              <button
                onClick={() => onJumpToDay(leg.covered!.date)}
                className="mt-2 ml-12 flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:underline"
              >
                <Check size={11} />
                {leg.covered.start_time} {leg.covered.activity.replace(/^✈️\s*/, '').replace(' 🛫 ', ' → ')}
              </button>
            ) : busy ? (
              <div className="mt-2 ml-12 flex items-center gap-1.5 text-[10px] text-zinc-400">
                <Loader2 size={11} className="animate-spin" /> {t('正在找交通方式…')}
              </div>
            ) : plan ? (
              <div className="mt-2 ml-12 space-y-1.5">
                {plan.options.map((opt, idx) => {
                  const Icon = MODE_ICON[opt.mode] ?? TrainFront;
                  const best = idx === plan.recommended;
                  return (
                    <div key={idx} className={cn('rounded-xl border p-2', best ? 'border-zinc-900/15 bg-zinc-50' : 'border-zinc-100')}>
                      <div className="flex items-center gap-1.5">
                        <Icon size={12} className="text-zinc-500 flex-shrink-0" />
                        <span className="text-[11px] font-bold text-zinc-800 flex-1 min-w-0 truncate">{opt.operator}</span>
                        {best && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white flex-shrink-0">{t('推薦')}</span>}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                        {opt.depart}–{opt.arrive} · {hm(opt.minutes)} · {opt.price}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">{opt.from_station} → {opt.to_station}</div>
                      {opt.book_ahead && <div className="text-[10px] text-amber-700 mt-0.5 leading-snug">{opt.book_ahead}</div>}
                      <div className="flex gap-3 mt-1.5">
                        {opt.book_url && /^https?:\/\//.test(opt.book_url) && (
                          <a href={opt.book_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-zinc-900 hover:underline">
                            <span className="flex items-center gap-1"><ExternalLink size={10} />{t('去訂票')}</span>
                          </a>
                        )}
                        <button
                          onClick={() => addToPlan(leg, plan, opt, idx)}
                          disabled={adding !== null}
                          className="text-[10px] font-bold text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          <span className="flex items-center gap-1">
                            {adding === `${leg.key}:${idx}` ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                            {t('加入行程（{at}）', { at: `${format(parseISO(leg.date), 'M/d')} ${opt.depart}` })}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {plan.tip && <p className="text-[10px] text-zinc-400 leading-snug">{plan.tip}</p>}
                <button onClick={() => suggest(leg)} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-700">
                  <span className="flex items-center gap-1"><RefreshCw size={10} />{t('重新建議')}</span>
                </button>
              </div>
            ) : (
              <button onClick={() => suggest(leg)} className="mt-2 ml-12 text-[10px] font-bold text-zinc-500 hover:text-zinc-900">
                <span className="flex items-center gap-1">
                  <RefreshCw size={10} />
                  {failed.has(leg.key) ? t('建議失敗，再試一次') : t('取得交通建議')}
                </span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
