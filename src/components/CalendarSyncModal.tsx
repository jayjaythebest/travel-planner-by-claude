import React, { useMemo, useState } from 'react';
import { CalendarCheck, Loader2, Plane, Check, Minus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Modal } from './Modal';
import { cn } from '../utils';
import { t, useLang, getLang } from '../i18n';
import { Activity, Trip } from '../types';

/**
 * Pick which activities go on the viewer's own Google Calendar — the whole
 * trip, a day, or one activity at a time — then mirror exactly that set.
 *
 * The choice is stored as what is EXCLUDED, so an activity added after the
 * last sync is included by default: "the whole trip" stays the whole trip.
 */
export function CalendarSyncModal({
  trip,
  activities,
  dates,
  synced,
  initialExcluded,
  scopeDate,
  onClose,
  onSync,
}: {
  trip: Trip;
  activities: Activity[];
  dates: string[];
  /** activity id -> event id, from this viewer's last sync. */
  synced: Record<string, string>;
  initialExcluded: string[];
  /** Show only this day; choices for other days are left as they were. */
  scopeDate?: string;
  onClose: () => void;
  /** `scopeIds` are the activities this picker showed; `excluded` is which of them were unticked. */
  onSync: (scopeIds: string[], excluded: string[]) => Promise<void>;
}) {
  useLang();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(initialExcluded));
  const [busy, setBusy] = useState(false);

  const byDay = useMemo(
    () =>
      dates.map(date => ({
        date,
        items: activities
          .filter(a => a.date === date)
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      })),
    [dates, activities],
  );
  // Activities dated outside the trip (an early outbound flight) still count.
  const outside = activities.filter(a => !dates.includes(a.date));
  const groups = scopeDate
    ? byDay.map(g => (g.date === scopeDate ? g : { ...g, items: [] }))
    : outside.length > 0 ? [...byDay, { date: '', items: outside }] : byDay;

  const all = groups.flatMap(g => g.items.map(a => a.id));
  const includedCount = all.filter(id => !excluded.has(id)).length;
  // Only what this picker shows can be removed by it; a deleted activity's
  // leftover event is cleaned up by any sync, so it counts in the full view.
  const removing = Object.keys(synced).filter(id =>
    excluded.has(id) ? all.includes(id) : !scopeDate && !activities.some(a => a.id === id),
  ).length;

  const setMany = (ids: string[], include: boolean) =>
    setExcluded(prev => {
      const next = new Set(prev);
      ids.forEach(id => (include ? next.delete(id) : next.add(id)));
      return next;
    });

  const Box = ({ state }: { state: 'on' | 'off' | 'some' }) => (
    <span
      className={cn(
        'w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold flex-shrink-0',
        state === 'off' ? 'border-zinc-300 bg-white' : 'bg-zinc-900 border-zinc-900 text-white',
      )}
    >
      {state === 'on' ? <Check size={11} strokeWidth={3} /> : state === 'some' ? <Minus size={11} strokeWidth={3} /> : null}
    </span>
  );
  const stateOf = (ids: string[]) => {
    const n = ids.filter(id => !excluded.has(id)).length;
    return n === 0 ? 'off' : n === ids.length ? 'on' : 'some';
  };

  const run = async () => {
    setBusy(true);
    try {
      await onSync(all, all.filter(id => excluded.has(id)));
      onClose();
    } catch {
      // The caller has already shown why; staying open makes the retry one tap.
    } finally {
      setBusy(false);
    }
  };

  const allState = stateOf(all);
  return (
    <Modal title={t('加入 Google Calendar')} onClose={onClose}>
      <div className="space-y-4">
        {!scopeDate && (
        <button
          onClick={() => setMany(all, allState !== 'on')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 text-left"
        >
          <Box state={allState} />
          <span className="text-sm font-bold text-zinc-900 flex-1">{t('整趟旅程')}</span>
          <span className="text-xs font-bold text-zinc-400 tabular-nums">{includedCount}／{all.length}</span>
        </button>
        )}

        <div className="space-y-3">
          {groups.map(({ date, items }, gi) => {
            if (items.length === 0) return null;
            const ids = items.map(a => a.id);
            const st = stateOf(ids);
            return (
              <div key={date || 'outside'} className="rounded-xl border border-zinc-200 overflow-hidden">
                <button
                  onClick={() => setMany(ids, st !== 'on')}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-zinc-50 border-b border-zinc-100 text-left"
                >
                  <Box state={st} />
                  <span className="text-xs font-bold text-zinc-700 flex-1">
                    {date
                      ? `Day ${gi + 1} · ${format(parseISO(date), getLang() === 'en' ? 'MMM d, EEE' : 'M/d')}`
                      : t('旅程日期以外')}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400 tabular-nums">
                    {ids.filter(id => !excluded.has(id)).length}／{ids.length}
                  </span>
                </button>
                <div className="divide-y divide-zinc-50">
                  {items.map(a => {
                    const on = !excluded.has(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => setMany([a.id], !on)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50"
                      >
                        <Box state={on ? 'on' : 'off'} />
                        <span className="text-[11px] font-bold text-zinc-400 tabular-nums w-10 flex-shrink-0">{a.start_time || '—'}</span>
                        {a.is_flight && <Plane size={11} className="text-blue-400 flex-shrink-0" />}
                        <span className={cn('text-xs flex-1 min-w-0 truncate', on ? 'text-zinc-800' : 'text-zinc-400')}>
                          {a.is_flight ? a.activity.replace(/^✈️\s*/, '').replace('航班:', t('航班:')).replace(' 🛫 ', ' → ') : a.activity}
                        </span>
                        {synced[a.id] && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {t('已在日曆')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {all.length === 0 && <p className="text-xs text-zinc-400 text-center py-6">{t('這趟還沒有任何行程')}</p>}
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {t('會加到你自己的 Google 日曆，旅伴要各自同步。之前同步過、這次取消勾選的行程會從你的日曆移除。')}
        </p>
        <button
          onClick={run}
          disabled={busy || (includedCount === 0 && removing === 0)}
          className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
          {removing > 0
            ? t('同步 {n} 筆，移除 {m} 筆', { n: includedCount, m: removing })
            : t('同步 {n} 筆到 Google Calendar', { n: includedCount })}
        </button>
      </div>
    </Modal>
  );
}
