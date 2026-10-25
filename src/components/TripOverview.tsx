import React, { useState } from 'react';
import {
  MapPin,
  Plane,
  Hotel,
  Wallet,
  CheckSquare,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Sparkles,
  Plus,
  Loader2,
  ChevronDown,
  Check,
  X as XIcon,
  KeyRound,
  Luggage,
} from 'lucide-react';
import { motion } from 'motion/react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn, convertAmount, totalsCurrency, flightNoOf, isOutboundDate, flagUrl } from '../utils';
import { Trip, Activity, Accommodation, Expense, ChecklistItem, Idea, User, SuggestedDay, Reservation } from '../types';
import { IdeaStash, isInReservations, CATEGORY_META } from './IdeaStash';
import { Section, useCollapsed } from './Section';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { t, useLang, getLang } from '../i18n';

const weekday = (d: Date) => (getLang() === 'en' ? format(d, 'EEE') : '週' + '日一二三四五六'[d.getDay()]);

/** A night is covered when some booking spans it: check_in ≤ night < check_out. */
function isNightCovered(night: string, accommodations: Accommodation[]) {
  return accommodations.some(a => a.check_in <= night && night < a.check_out);
}

function StatTile({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl border border-zinc-200 p-3 text-left flex flex-col gap-1',
        onClick && 'active:scale-[0.98] transition-transform hover:border-zinc-300',
      )}
    >
      <div className="flex items-center gap-1.5 text-zinc-400">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-lg font-black text-zinc-900 leading-none tabular-nums">{value}</div>
      {sub && <div className="text-[9px] text-zinc-400 font-medium leading-tight">{sub}</div>}
    </Tag>
  );
}

/**
 * A suggested plan for one day, under its row in 每日一覽. Disappears once every
 * stop has been imported; the imported ones are already in the row above.
 */
function SuggestedDayCard({ day, onImport }: { day: SuggestedDay; onImport: (stopIds: string[]) => Promise<void> }) {
  // One import at a time per day: a second tap mid-import would add the same
  // stops again, because the imported flags are only written at the end.
  const [busy, setBusy] = useState<string | null>(null);
  const pending = day.stops.filter(s => !s.imported);
  if (pending.length === 0) return null;
  const importedCount = day.stops.length - pending.length;

  const run = async (key: string, ids: string[]) => {
    if (busy) return;
    setBusy(key);
    try {
      await onImport(ids);
    } catch (err) {
      console.error(err);
      alert(t('加入失敗，請再試一次。'));
    }
    setBusy(null);
  };

  return (
    <div className="mx-3 mb-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-widest text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
            {t('建議')}
          </span>
          <span className="text-[11px] font-bold text-violet-900/80 truncate">{(getLang() === 'zh' && day.title_zh) || day.title}</span>
        </div>
        <button
          onClick={() => run('all', pending.map(s => s.id))}
          disabled={busy !== null}
          className="flex items-center gap-1 text-[10px] font-bold text-white bg-violet-600 px-2 py-1 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {busy === 'all' ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
          {t('全部加入行程')}
        </button>
      </div>
      {day.summary && (
        <p className="text-[10px] text-violet-900/60 leading-relaxed mb-2 italic">{(getLang() === 'zh' && day.summary_zh) || day.summary}</p>
      )}
      <ul className="space-y-1">
        {pending.map(s => (
          <li key={s.id} className="flex items-start gap-2">
            <span className="text-[10px] font-bold text-violet-500 tabular-nums w-9 flex-shrink-0 pt-0.5">{s.start_time}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-zinc-700 leading-snug">{s.activity}</div>
              {(s.area || s.note) && (
                <div className="text-[10px] text-zinc-400 leading-snug">
                  {[s.area, (getLang() === 'zh' && s.note_zh) || s.note].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <button
              onClick={() => run(s.id, [s.id])}
              disabled={busy !== null}
              title={t('加入這筆')}
              className="p-1 text-violet-400 hover:text-violet-700 hover:bg-violet-100 rounded-md transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {busy === s.id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            </button>
          </li>
        ))}
      </ul>
      {importedCount > 0 && (
        <p className="text-[9px] text-violet-500/70 mt-1.5">{t('已加入 {n} 筆', { n: importedCount })}</p>
      )}
    </div>
  );
}

const RES_META: Record<Reservation['status'], { label: string; chip: string }> = {
  requested: { label: '已請 Muse 查詢', chip: 'bg-zinc-100 text-zinc-600' },
  booked: { label: '已訂位', chip: 'bg-emerald-100/80 text-emerald-800' },
  available: { label: '可訂', chip: 'bg-sky-100/80 text-sky-800' },
  needs_card: { label: '需綁卡', chip: 'bg-amber-100/80 text-amber-800' },
  unavailable: { label: '訂不到', chip: 'bg-red-100/80 text-red-800' },
  walk_in: { label: '現場排隊', chip: 'bg-violet-100/80 text-violet-800' },
};
const RES_ORDER: Reservation['status'][] = ['booked', 'available', 'needs_card', 'walk_in', 'unavailable', 'requested'];
const FOOD_ICON: Record<string, boolean> = { restaurant: true, cafe: true, bar: true };

const fmtSlot = (s: string) => {
  const d = parseISO(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? s : format(d, 'M/d HH:mm');
};

/**
 * Restaurants, cafés and bars that are booked or being worked on — asked of
 * Muse, or reported back with times that still need a decision. Walk-ins and
 * places with no table stay in the idea stash instead (marked there), so a
 * place is only ever in one of the two lists; see isInReservations.
 *
 * The two buttons are manual overrides for when someone booked a needs-card
 * place themselves, or gave up on it. `manual` tells the reservation-agent to
 * leave the place alone from then on.
 */
function Reservations({
  ideas,
  trip,
  activities,
  dates,
  onToggle,
  onAddToPlan,
  onJumpToDay,
}: {
  ideas: Idea[];
  trip: Trip;
  activities: Activity[];
  dates: string[];
  onToggle: (on: boolean) => Promise<void>;
  onAddToPlan: (idea: Idea) => Promise<void>;
  onJumpToDay: (date: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  /** The activity a booking already became, by idea id or, for older rows, by name and day. */
  const placedAs = (i: Idea) => {
    const date = i.reservation?.slots?.[0]?.slice(0, 10);
    return activities.find(a => a.idea_id === i.id || (a.activity === i.title && a.date === date));
  };
  const [open, toggleOpen] = useCollapsed('reservations', true);
  const food = ideas.filter(i => FOOD_ICON[i.category]);
  if (food.length === 0) return null;
  const rows = ideas
    .filter(isInReservations)
    .sort((a, b) => RES_ORDER.indexOf(a.reservation!.status) - RES_ORDER.indexOf(b.reservation!.status));
  const booked = rows.filter(i => i.reservation?.status === 'booked').length;
  const thread = trip.reservation_thread;
  const when = (iso?: string) => (iso ? format(parseISO(iso), 'M/d HH:mm') : '—');

  const mark = async (idea: Idea, status: 'booked' | 'unavailable') => {
    try {
      await updateDoc(doc(db, 'ideas', idea.id), {
        'reservation.status': status,
        'reservation.manual': true,
        'reservation.updated_at': new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={toggleOpen}
          className="flex items-center gap-1.5 min-w-0 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
        >
          <ChevronDown size={14} className={cn('flex-shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate">{t('訂位狀況')}</span>
          <span className="normal-case tracking-normal text-[11px] font-medium text-zinc-300 truncate">
            · {t('已訂 {n}／{total}', { n: booked, total: rows.length })}
          </span>
        </button>
        <button
          onClick={async () => { setSaving(true); try { await onToggle(!trip.reservations_enabled); } finally { setSaving(false); } }}
          disabled={saving}
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 flex-shrink-0',
            trip.reservations_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-900 text-white border-zinc-900',
          )}
        >
          {trip.reservations_enabled ? t('Muse 訂位：開') : t('開始請 Muse 訂位')}
        </button>
      </div>
      {open && (
        <>
          {rows.length === 0 ? (
            <p className="text-xs text-zinc-400 bg-white rounded-2xl border border-dashed border-zinc-200 p-4 text-center">
              {t('目前沒有已訂或接洽中的訂位')}
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
              {rows.map(i => {
                const r = i.reservation!;
                const meta = RES_META[r.status];
                return (
                  <div key={i.id} className="p-3">
                    <div className="flex items-center gap-2">
                      {React.createElement(CATEGORY_META[i.category].icon, { size: 13, className: 'text-zinc-400 flex-shrink-0' })}
                      <span className="text-xs font-bold text-zinc-800 flex-1 min-w-0 truncate">{i.title}</span>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0', meta.chip)}>
                        {t(meta.label)}
                      </span>
                    </div>
                    {(r.slots?.length || r.confirmation || r.note) ? (
                      <div className="pl-6 mt-1.5 space-y-1">
                        {r.slots && r.slots.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.slots.map(s => (
                              <span key={s} className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-100 text-zinc-600">
                                {fmtSlot(s)}
                              </span>
                            ))}
                          </div>
                        )}
                        {r.confirmation && (
                          <div className="text-[10px] text-emerald-700">{t('確認碼：{code}', { code: r.confirmation })}</div>
                        )}
                        {r.note && <div className="text-[10px] text-zinc-400 leading-snug">{(getLang() === 'en' && r.note_en) || r.note}</div>}
                      </div>
                    ) : null}
                    {r.status === 'booked' && (() => {
                      const placed = placedAs(i);
                      if (placed) {
                        const day = dates.indexOf(placed.date) + 1;
                        return (
                          <button onClick={() => onJumpToDay(placed.date)} className="pl-6 mt-2 text-[10px] font-bold text-zinc-500 hover:text-zinc-900">
                            <span className="flex items-center gap-1"><Check size={11} />{day > 0 ? t('已在 Day {n} 行程 →', { n: day }) : t('已加入行程')}</span>
                          </button>
                        );
                      }
                      const slot = r.slots?.[0];
                      if (!slot || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(slot)) return null;
                      return (
                        <div className="pl-6 mt-2">
                          <button
                            onClick={async () => {
                              if (adding) return;
                              setAdding(i.id);
                              try { await onAddToPlan(i); } catch (err) { console.error(err); alert(t('加入失敗，請再試一次。')); }
                              setAdding(null);
                            }}
                            disabled={adding !== null}
                            className="flex items-center gap-1 text-[10px] font-bold text-white bg-zinc-900 px-2.5 py-1 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                          >
                            {adding === i.id ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                            {t('加入行程（{at}）', { at: fmtSlot(slot) })}
                          </button>
                        </div>
                      );
                    })()}
                    {r.status !== 'booked' && (
                      <div className="pl-6 mt-2 flex gap-3">
                        <button onClick={() => mark(i, 'booked')} className="text-[10px] font-bold text-emerald-600 hover:underline">
                          <span className="flex items-center gap-1"><Check size={11} />{t('標記已訂')}</span>
                        </button>
                        <button onClick={() => mark(i, 'unavailable')} className="text-[10px] font-bold text-zinc-400 hover:text-red-500 hover:underline">
                          <span className="flex items-center gap-1"><XIcon size={11} />{t('訂不到')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-zinc-400">
            {!trip.reservations_enabled ? t('還沒開啟。開啟後每 10 分鐘檢查一次，有新的店就寄信給 Muse。') : t('每 10 分鐘讀取 Muse 的回覆 · 上次寄出 {sent} · 上次回覆 {reply}', {
              sent: when(thread?.last_request_at),
              reply: when(thread?.last_reply_at),
            })}
          </p>
        </>
      )}
    </div>
  );
}

export function TripOverview({
  trip,
  dates,
  activities,
  accommodations,
  expenses,
  checklist,
  ideas,
  currentUser,
  members,
  onJumpToDay,
  onOpenExpenses,
  onAddAccommodation,
  onAddFlight,
  onImportSuggestion,
  onToggleReservations,
  onCoverError,
  onAddBookingToPlan,
}: {
  trip: Trip;
  dates: string[];
  activities: Activity[];
  accommodations: Accommodation[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  ideas: Idea[];
  currentUser: User | null;
  members: User[];
  onJumpToDay: (date: string) => void;
  onOpenExpenses: () => void;
  onAddAccommodation: () => void;
  onAddFlight: () => void;
  onImportSuggestion: (date: string, stopIds: string[]) => Promise<void>;
  onToggleReservations: (on: boolean) => Promise<void>;
  onCoverError: () => void;
  onAddBookingToPlan: (idea: Idea) => Promise<void>;
}) {
  useLang();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(trip.start_date);
  const end = parseISO(trip.end_date);
  const daysUntil = differenceInDays(start, today);
  const nights = Math.max(differenceInDays(end, start), 0);
  const todayStr = format(today, 'yyyy-MM-dd');

  const status =
    daysUntil > 0
      ? { label: t('出發倒數 {n} 天', { n: daysUntil }), tone: 'bg-blue-50 text-blue-600 border-blue-100' }
      : today <= end
        ? { label: t('旅程進行中'), tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
        : { label: t('已完成'), tone: 'bg-zinc-100 text-zinc-400 border-zinc-200' };

  const suggestedByDate = Object.fromEntries(
    (trip.suggested_plan?.days ?? []).map(d => [d.date, d] as const),
  ) as Record<string, SuggestedDay | undefined>;

  const flights = activities.filter(a => a.is_flight);
  const spots = activities.filter(a => !a.is_flight);

  const totalCurrency = totalsCurrency(trip.country);
  const totalSpent = expenses.reduce((sum, e) => sum + convertAmount(e.amount, e.currency, totalCurrency), 0);
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + convertAmount(e.amount, e.currency, totalCurrency);
    return acc;
  }, {});
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const checkedCount = checklist.filter(c => c.is_checked).length;
  const checklistPct = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;

  // ── Health checks ──────────────────────────────────────────────────────
  // Only worth raising before the trip starts: an empty day that already
  // happened is history, not a gap to fill.
  const emptyDays = dates
    .map((d, i) => ({ date: d, day: i + 1 }))
    .filter(d => !activities.some(a => a.date === d.date) && d.date >= todayStr);
  // Nights are every day but the last — you sleep somewhere on each of them.
  const uncoveredNights = dates
    .slice(0, -1)
    .map((d, i) => ({ date: d, day: i + 1 }))
    .filter(d => !isNightCovered(d.date, accommodations) && d.date >= todayStr);

  // A 14-day trip planned from scratch flags every day, and "Day 2、3、4、5、6、
  // 7、8、9、10、11、12、13、14" wraps to three lines and says nothing the count
  // does not. Four is enough to be specific before the tally takes over.
  const dayList = (days: { day: number }[]) =>
    days.length <= 4
      ? `Day ${days.map(d => d.day).join(t('、'))}`
      : t('Day {list} 等 {n} 天', { list: days.slice(0, 4).map(d => d.day).join(t('、')), n: days.length });

  const warnings: { icon: React.ReactNode; text: string; action?: () => void; actionLabel?: string }[] = [];
  if (accommodations.length === 0 && dates.length > 1) {
    warnings.push({
      icon: <Hotel size={12} />,
      text: t('還沒有登記任何住宿'),
      action: onAddAccommodation,
      actionLabel: t('新增住宿'),
    });
  } else if (uncoveredNights.length > 0) {
    warnings.push({
      icon: <Hotel size={12} />,
      text: t('{days}的晚上還沒有住宿', { days: dayList(uncoveredNights) }),
      action: onAddAccommodation,
      actionLabel: t('新增住宿'),
    });
  }
  // A flight with no passenger list predates the list and counts for everyone.
  const flightsOf = (uid: string) =>
    flights
      .filter(f => !f.passengers || f.passengers.includes(uid))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  const noFlight = members.length > 1 ? members.filter(u => flightsOf(u.id).length === 0) : [];
  if (flights.length === 0) {
    warnings.push({ icon: <Plane size={12} />, text: t('還沒有登記航班'), action: onAddFlight, actionLabel: t('新增航班') });
  } else if (noFlight.length > 0) {
    warnings.push({
      icon: <Plane size={12} />,
      text: t('{names} 還沒登記航班', { names: noFlight.map(u => u.username.split(' ')[0]).join(t('、')) }),
      action: onAddFlight,
      actionLabel: t('新增航班'),
    });
  }
  if (emptyDays.length > 0) {
    warnings.push({
      icon: <Calendar size={12} />,
      text: t('{days}還是空的', { days: dayList(emptyDays) }),
      action: () => onJumpToDay(emptyDays[0].date),
      actionLabel: t('去 Day {n}', { n: emptyDays[0].day }),
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-5 text-white"
      >
        {trip.cover_url ? (
          <>
            <img src={trip.cover_url} alt="" onError={onCoverError} className="absolute inset-0 w-full h-full object-cover" />
            {/* Dark at the bottom where the dates sit, lighter at the top so the photo still reads. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/80" />
          </>
        ) : (
          <>
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/[0.04]" />
            <div className="absolute -right-2 bottom-[-3rem] w-28 h-28 rounded-full bg-white/[0.03]" />
          </>
        )}
        <div className="relative">
          <span className={cn('inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border', status.tone)}>
            {status.label}
          </span>
          <h2 className="text-2xl font-black mt-2.5 leading-tight">{trip.name}</h2>
          <div className="flex items-center gap-1.5 mt-1.5 text-white/50">
            {flagUrl(trip.country) ? (
              <img src={flagUrl(trip.country)!} alt="" className="w-4 h-3 object-cover rounded-[2px] shadow-sm" />
            ) : (
              <MapPin size={11} />
            )}
            <span className="text-[11px] font-bold uppercase tracking-wider">{trip.country}</span>
          </div>
          {members.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-1.5">
                {members.slice(0, 6).map(u => (
                  <div
                    key={u.id}
                    title={u.username}
                    className="w-6 h-6 rounded-full bg-white/15 border border-zinc-800 flex items-center justify-center text-[10px] font-bold"
                  >
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-white/60 truncate">
                {members.map(u => u.username.split(' ')[0]).join(', ')}
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
            <div>
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{t('出發')}</div>
              <div className="text-sm font-bold tabular-nums">{format(start, 'M/d')}</div>
              <div className="text-[9px] text-white/40">{weekday(start)}</div>
            </div>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 border-t border-dashed border-white/20" />
              <span className="text-[10px] font-bold text-white/60 whitespace-nowrap">
                {t('{days}天{nights}夜', { days: dates.length, nights })}
              </span>
              <div className="flex-1 border-t border-dashed border-white/20" />
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{t('回程')}</div>
              <div className="text-sm font-bold tabular-nums">{format(end, 'M/d')}</div>
              <div className="text-[9px] text-white/40">{weekday(end)}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          icon={<MapPin size={11} />}
          label={t('行程')}
          value={`${spots.length}`}
          sub={flights.length > 0 ? t('另有 {n} 段航班', { n: flights.length }) : t('個景點與活動')}
        />
        <StatTile
          icon={<Hotel size={11} />}
          label={t('住宿')}
          value={`${accommodations.length}`}
          sub={
            dates.length > 1
              ? t('{done}／{total} 晚已安排', { done: nights - uncoveredNights.length, total: nights })
              : t('當日來回')
          }
        />
        <StatTile
          icon={<Wallet size={11} />}
          label={t('總支出')}
          value={`$${Math.round(totalSpent).toLocaleString()}`}
          sub={t('{n} 筆 · {cur}', { n: expenses.length, cur: totalCurrency })}
          onClick={onOpenExpenses}
        />
        <StatTile
          icon={<CheckSquare size={11} />}
          label={t('準備清單')}
          value={checklist.length > 0 ? `${checkedCount}／${checklist.length}` : '—'}
          sub={checklist.length > 0 ? t('完成 {pct}%', { pct: checklistPct }) : t('尚未建立')}
          onClick={() => onJumpToDay(dates[0])}
        />
      </div>

      {/* ── Health checks ── */}
      {warnings.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-amber-700">
            <AlertTriangle size={11} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t('還缺什麼')}</span>
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-amber-900/80">
              <span className="text-amber-500 flex-shrink-0">{w.icon}</span>
              <span className="flex-1 leading-snug">{w.text}</span>
              {w.action && (
                <button
                  onClick={w.action}
                  className="text-[10px] font-bold text-amber-700 bg-white border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0"
                >
                  {w.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Reservations ── */}
      <Reservations
        ideas={ideas}
        trip={trip}
        activities={activities}
        dates={dates}
        onToggle={onToggleReservations}
        onAddToPlan={onAddBookingToPlan}
        onJumpToDay={onJumpToDay}
      />

      {/* ── Idea stash ── */}
      <IdeaStash
        trip={trip}
        ideas={ideas}
        activities={activities}
        dates={dates}
        currentUser={currentUser}
        onJumpToDay={onJumpToDay}
      />

      {/* ── Day by day ── */}
      <Section id="days" title={t('每日一覽')} summary={t('{n} 天', { n: dates.length })}>
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
          {dates.map((date, i) => {
            const dayActivities = activities
              .filter(a => a.date === date)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            const d = parseISO(date);
            const isToday = date === todayStr;
            const hasFlight = dayActivities.some(a => a.is_flight);
            const checkIn = accommodations.find(a => a.check_in === date);
            const checkOut = accommodations.find(a => a.check_out === date);
            const preview = dayActivities
              .filter(a => !a.is_flight)
              .map(a => a.activity)
              .slice(0, 3)
              .join(' · ');

            return (
              <div key={date}>
              <button
                onClick={() => onJumpToDay(date)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-zinc-50',
                  isToday && 'bg-emerald-50/40',
                )}
              >
                <div
                  className={cn(
                    'w-11 flex-shrink-0 rounded-xl py-1.5 text-center border',
                    isToday
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : dayActivities.length === 0
                        ? 'bg-zinc-50 text-zinc-300 border-zinc-100 border-dashed'
                        : 'bg-zinc-900 text-white border-zinc-900',
                  )}
                >
                  <div className="text-[8px] font-bold uppercase tracking-widest opacity-60 leading-none">Day</div>
                  <div className="text-base font-black leading-tight tabular-nums">{i + 1}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-zinc-700 tabular-nums">
                      {format(d, 'M/d')}
                      <span className="font-normal text-zinc-400 ml-1">{weekday(d)}</span>
                    </span>
                    {isToday && (
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        {t('今天')}
                      </span>
                    )}
                    {hasFlight && <Plane size={10} className="text-blue-400" />}
                    {checkIn && <span title={t('入住 {name}', { name: checkIn.name })}><KeyRound size={10} className="text-zinc-400" /></span>}
                    {checkOut && <span title={t('退房 {name}', { name: checkOut.name })}><Luggage size={10} className="text-zinc-400" /></span>}
                  </div>
                  <p
                    className={cn(
                      'text-[11px] mt-0.5 truncate leading-relaxed',
                      dayActivities.length === 0 ? 'text-zinc-300 italic' : 'text-zinc-500',
                    )}
                  >
                    {dayActivities.length === 0
                      ? t('這天還是空的')
                      : preview || t('{n} 項行程', { n: dayActivities.length })}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {dayActivities.length > 0 && (
                    <span className="text-[10px] font-bold text-zinc-400 tabular-nums">{dayActivities.length}</span>
                  )}
                  <ChevronRight size={14} className="text-zinc-300" />
                </div>
              </button>
              {suggestedByDate[date] && (
                <SuggestedDayCard day={suggestedByDate[date]} onImport={ids => onImportSuggestion(date, ids)} />
              )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Flights ── */}
      {flights.length > 0 && (
        <Section id="flights" title={t('航班')} summary={t('{n} 班', { n: flights.length })} defaultOpen={false}>
          <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
            {flights
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
              .map(f => (
                <button
                  key={f.id}
                  onClick={() => onJumpToDay(f.date)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-50 transition-colors"
                >
                  <Plane size={14} className="text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-800 truncate">{f.activity.replace(/^✈️\s*/, '').replace('航班:', t('航班:')).replace(' 🛫 ', ' → ')}</div>
                    <div className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                      {format(parseISO(f.date), 'M/d')} · {f.start_time} → {f.end_time}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-300 flex-shrink-0" />
                </button>
              ))}
          </div>
        </Section>
      )}

      {/* ── Who is on which flight ── */}
      {members.length > 1 && flights.length > 0 && (
        <Section id="who-flies" title={t('誰搭哪一班')} summary={noFlight.length > 0 ? t('{n} 人還沒登記', { n: noFlight.length }) : t('{n} 人', { n: members.length })}>
          <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
            {members.map(u => {
              const mine = flightsOf(u.id);
              return (
                <div key={u.id} className="flex items-start gap-3 p-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-[11px] font-bold text-zinc-500 flex-shrink-0">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-zinc-800">{u.username}</div>
                    {mine.length === 0 ? (
                      <div className="text-[10px] text-amber-600 mt-0.5">{t('還沒登記航班')}</div>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mine.map(f => {
                          const out = isOutboundDate(f.date, trip.start_date, trip.end_date);
                          return (
                            <button
                              key={f.id}
                              onClick={() => onJumpToDay(f.date)}
                              className={cn(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded-md border tabular-nums',
                                out ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-violet-50 text-violet-600 border-violet-100',
                              )}
                            >
                              {out ? t('去') : t('回')} {flightNoOf(f.activity) ?? t('航班')} · {format(parseISO(f.date), 'M/d')} {f.start_time}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Accommodations ── */}
      {accommodations.length > 0 && (
        <Section id="lodging" title={t('住宿')} summary={t('{n} 間', { n: accommodations.length })} defaultOpen={false}>
          <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
            {accommodations
              .slice()
              .sort((a, b) => a.check_in.localeCompare(b.check_in))
              .map(acc => {
                const accNights = Math.max(differenceInDays(parseISO(acc.check_out), parseISO(acc.check_in)), 0);
                return (
                  <div key={acc.id} className="flex items-center gap-3 p-3">
                    <Hotel size={14} className="text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-zinc-800 truncate">{acc.name}</div>
                      <div className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                        {format(parseISO(acc.check_in), 'M/d')} → {format(parseISO(acc.check_out), 'M/d')} · {t('{n} 晚', { n: accNights })}
                      </div>
                    </div>
                    {acc.map_url && (
                      <a
                        href={acc.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1 flex-shrink-0"
                      >
                        <MapPin size={10} /> {t('地圖')}
                      </a>
                    )}
                  </div>
                );
              })}
          </div>
        </Section>
      )}

      {/* ── Expenses by category ── */}
      {topCategories.length > 0 && (
        <Section
          id="spending"
          title={t('支出分布')}
          summary={`$${Math.round(totalSpent).toLocaleString()} ${totalCurrency}`}
          defaultOpen={false}
          right={
            <button onClick={onOpenExpenses} className="text-[11px] font-bold text-zinc-400 hover:text-zinc-900 flex-shrink-0">
              {t('詳細分析 →')}
            </button>
          }
        >
          <div className="bg-white rounded-2xl border border-zinc-200 p-3.5 space-y-2.5">
            {topCategories.map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-bold text-zinc-600">{t(cat)}</span>
                  <span className="text-zinc-400 tabular-nums">
                    ${Math.round(amount).toLocaleString()}
                    <span className="text-zinc-300 ml-1.5">
                      {totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${totalSpent > 0 ? (amount / totalSpent) * 100 : 0}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full bg-zinc-900 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Checklist progress ── */}
      {checklist.length > 0 && (
        <button
          onClick={() => onJumpToDay(dates[0])}
          className="w-full bg-white rounded-2xl border border-zinc-200 p-3.5 text-left hover:border-zinc-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <CheckSquare size={12} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('準備清單')}</span>
            </div>
            <span className="text-[11px] font-bold text-zinc-500 tabular-nums">
              {checkedCount}／{checklist.length}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${checklistPct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={cn('h-full rounded-full', checklistPct === 100 ? 'bg-emerald-500' : 'bg-zinc-900')}
            />
          </div>
          {checklistPct < 100 && (
            <p className="text-[10px] text-zinc-400 mt-2 flex items-center gap-1">
              <Sparkles size={9} /> {t('還有 {n} 項沒準備，在 Day 1 可以勾選', { n: checklist.length - checkedCount })}
            </p>
          )}
        </button>
      )}
    </div>
  );
}
