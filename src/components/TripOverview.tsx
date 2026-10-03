import React from 'react';
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
} from 'lucide-react';
import { motion } from 'motion/react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn, EXCHANGE_RATES } from '../utils';
import { Trip, Activity, Accommodation, Expense, ChecklistItem, Idea, User } from '../types';
import { IdeaStash } from './IdeaStash';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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

export function TripOverview({
  trip,
  dates,
  activities,
  accommodations,
  expenses,
  checklist,
  ideas,
  currentUser,
  onJumpToDay,
  onOpenExpenses,
  onAddAccommodation,
  onAddFlight,
}: {
  trip: Trip;
  dates: string[];
  activities: Activity[];
  accommodations: Accommodation[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  ideas: Idea[];
  currentUser: User | null;
  onJumpToDay: (date: string) => void;
  onOpenExpenses: () => void;
  onAddAccommodation: () => void;
  onAddFlight: () => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(trip.start_date);
  const end = parseISO(trip.end_date);
  const daysUntil = differenceInDays(start, today);
  const nights = Math.max(differenceInDays(end, start), 0);
  const todayStr = format(today, 'yyyy-MM-dd');

  const status =
    daysUntil > 0
      ? { label: `出發倒數 ${daysUntil} 天`, tone: 'bg-blue-50 text-blue-600 border-blue-100' }
      : today <= end
        ? { label: '旅程進行中', tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
        : { label: '已完成', tone: 'bg-zinc-100 text-zinc-400 border-zinc-200' };

  const flights = activities.filter(a => a.is_flight);
  const spots = activities.filter(a => !a.is_flight);

  const totalTWD = expenses.reduce((sum, e) => sum + e.amount * (EXCHANGE_RATES[e.currency] || 1), 0);
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount * (EXCHANGE_RATES[e.currency] || 1);
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
      ? `Day ${days.map(d => d.day).join('、')}`
      : `Day ${days.slice(0, 4).map(d => d.day).join('、')} 等 ${days.length} 天`;

  const warnings: { icon: React.ReactNode; text: string; action?: () => void; actionLabel?: string }[] = [];
  if (accommodations.length === 0 && dates.length > 1) {
    warnings.push({
      icon: <Hotel size={12} />,
      text: '還沒有登記任何住宿',
      action: onAddAccommodation,
      actionLabel: '新增住宿',
    });
  } else if (uncoveredNights.length > 0) {
    warnings.push({
      icon: <Hotel size={12} />,
      text: `${dayList(uncoveredNights)}的晚上還沒有住宿`,
      action: onAddAccommodation,
      actionLabel: '新增住宿',
    });
  }
  if (flights.length === 0) {
    warnings.push({ icon: <Plane size={12} />, text: '還沒有登記航班', action: onAddFlight, actionLabel: '新增航班' });
  }
  if (emptyDays.length > 0) {
    warnings.push({
      icon: <Calendar size={12} />,
      text: `${dayList(emptyDays)}還是空的`,
      action: () => onJumpToDay(emptyDays[0].date),
      actionLabel: `去 Day ${emptyDays[0].day}`,
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
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/[0.04]" />
        <div className="absolute -right-2 bottom-[-3rem] w-28 h-28 rounded-full bg-white/[0.03]" />
        <div className="relative">
          <span className={cn('inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border', status.tone)}>
            {status.label}
          </span>
          <h2 className="text-2xl font-black mt-2.5 leading-tight">{trip.name}</h2>
          <div className="flex items-center gap-1.5 mt-1.5 text-white/50">
            <MapPin size={11} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{trip.country}</span>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
            <div>
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest">出發</div>
              <div className="text-sm font-bold tabular-nums">{format(start, 'M/d')}</div>
              <div className="text-[9px] text-white/40">週{WEEKDAYS[start.getDay()]}</div>
            </div>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 border-t border-dashed border-white/20" />
              <span className="text-[10px] font-bold text-white/60 whitespace-nowrap">
                {dates.length}天{nights}夜
              </span>
              <div className="flex-1 border-t border-dashed border-white/20" />
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest">回程</div>
              <div className="text-sm font-bold tabular-nums">{format(end, 'M/d')}</div>
              <div className="text-[9px] text-white/40">週{WEEKDAYS[end.getDay()]}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          icon={<MapPin size={11} />}
          label="行程"
          value={`${spots.length}`}
          sub={flights.length > 0 ? `另有 ${flights.length} 段航班` : '個景點與活動'}
        />
        <StatTile
          icon={<Hotel size={11} />}
          label="住宿"
          value={`${accommodations.length}`}
          sub={
            dates.length > 1
              ? `${nights - uncoveredNights.length}／${nights} 晚已安排`
              : '當日來回'
          }
        />
        <StatTile
          icon={<Wallet size={11} />}
          label="總支出"
          value={`$${Math.round(totalTWD).toLocaleString()}`}
          sub={`${expenses.length} 筆 · TWD`}
          onClick={onOpenExpenses}
        />
        <StatTile
          icon={<CheckSquare size={11} />}
          label="準備清單"
          value={checklist.length > 0 ? `${checkedCount}／${checklist.length}` : '—'}
          sub={checklist.length > 0 ? `完成 ${checklistPct}%` : '尚未建立'}
          onClick={() => onJumpToDay(dates[0])}
        />
      </div>

      {/* ── Health checks ── */}
      {warnings.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-amber-700">
            <AlertTriangle size={11} />
            <span className="text-[10px] font-bold uppercase tracking-widest">還缺什麼</span>
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
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">每日一覽</h3>
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
              <button
                key={date}
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
                      <span className="font-normal text-zinc-400 ml-1">週{WEEKDAYS[d.getDay()]}</span>
                    </span>
                    {isToday && (
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        今天
                      </span>
                    )}
                    {hasFlight && <Plane size={10} className="text-blue-400" />}
                    {checkIn && <span className="text-[9px]" title={`入住 ${checkIn.name}`}>🔑</span>}
                    {checkOut && <span className="text-[9px]" title={`退房 ${checkOut.name}`}>🧳</span>}
                  </div>
                  <p
                    className={cn(
                      'text-[11px] mt-0.5 truncate leading-relaxed',
                      dayActivities.length === 0 ? 'text-zinc-300 italic' : 'text-zinc-500',
                    )}
                  >
                    {dayActivities.length === 0
                      ? '這天還是空的'
                      : preview || `${dayActivities.length} 項行程`}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {dayActivities.length > 0 && (
                    <span className="text-[10px] font-bold text-zinc-400 tabular-nums">{dayActivities.length}</span>
                  )}
                  <ChevronRight size={14} className="text-zinc-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Flights ── */}
      {flights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">航班</h3>
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
                    <div className="text-xs font-bold text-zinc-800 truncate">{f.activity}</div>
                    <div className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                      {format(parseISO(f.date), 'M/d')} · {f.start_time} → {f.end_time}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-300 flex-shrink-0" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Accommodations ── */}
      {accommodations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">住宿</h3>
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
                        {format(parseISO(acc.check_in), 'M/d')} → {format(parseISO(acc.check_out), 'M/d')} · {accNights} 晚
                      </div>
                    </div>
                    {acc.map_url && (
                      <a
                        href={acc.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1 flex-shrink-0"
                      >
                        <MapPin size={10} /> 地圖
                      </a>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Expenses by category ── */}
      {topCategories.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">支出分布</h3>
            <button onClick={onOpenExpenses} className="text-[11px] font-bold text-zinc-400 hover:text-zinc-900">
              詳細分析 →
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-3.5 space-y-2.5">
            {topCategories.map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-bold text-zinc-600">{cat}</span>
                  <span className="text-zinc-400 tabular-nums">
                    ${Math.round(amount).toLocaleString()}
                    <span className="text-zinc-300 ml-1.5">
                      {totalTWD > 0 ? Math.round((amount / totalTWD) * 100) : 0}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${totalTWD > 0 ? (amount / totalTWD) * 100 : 0}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full bg-zinc-900 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
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
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">準備清單</span>
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
              <Sparkles size={9} /> 還有 {checklist.length - checkedCount} 項沒準備，在 Day 1 可以勾選
            </p>
          )}
        </button>
      )}
    </div>
  );
}
