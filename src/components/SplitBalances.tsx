import React, { useState } from 'react';
import { Plus, X, UserPlus } from 'lucide-react';
import { cn, settleUp } from '../utils';
import { t, useLang } from '../i18n';
import { Expense, User } from '../types';

/**
 * Who paid, who owes, and the fewest transfers that even it out.
 *
 * Shown whenever the spending window is open, not only once something has been
 * split: an empty table with everyone at $0 is what tells people the feature
 * exists. `people` is app members plus guests — travellers who are not on the
 * app but still share costs; guests are managed here because this is the only
 * place they matter.
 */
export function SplitBalances({
  people,
  guestIds,
  expenses,
  currency,
  toCur,
  onAddGuest,
  onRemoveGuest,
}: {
  people: User[];
  guestIds: Set<string>;
  expenses: Expense[];
  currency: string;
  toCur: (e: Expense) => number;
  onAddGuest: (name: string) => Promise<void>;
  onRemoveGuest: (id: string) => Promise<void>;
}) {
  useLang();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const split = expenses.filter(e => e.paid_by && e.split_with && e.split_with.length > 0);
  const paid: Record<string, number> = {};
  const share: Record<string, number> = {};
  for (const e of split) {
    const amt = toCur(e);
    paid[e.paid_by!] = (paid[e.paid_by!] || 0) + amt;
    for (const id of e.split_with!) share[id] = (share[id] || 0) + amt / e.split_with!.length;
  }
  // Anyone who appears in an expense but is no longer on the trip still has a
  // balance; dropping them would make the totals not add up.
  const ids = [...new Set([...people.map(p => p.id), ...Object.keys(paid), ...Object.keys(share)])];
  const nameOf = (id: string) => people.find(p => p.id === id)?.username || '—';
  const net: Record<string, number> = Object.fromEntries(ids.map(id => [id, (paid[id] || 0) - (share[id] || 0)]));
  const transfers = settleUp(net);
  const used = new Set(split.flatMap(e => [e.paid_by!, ...e.split_with!]));
  const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString()}`;

  const submit = async () => {
    if (!name.trim()) return;
    await onAddGuest(name.trim());
    setName('');
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('分帳結算 ({cur})', { cur: currency })}</h4>

      <div className="bg-white border border-zinc-100 rounded-xl divide-y divide-zinc-50">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
          <span>{t('成員')}</span>
          <span className="text-right">{t('已付')}</span>
          <span className="text-right">{t('應分攤')}</span>
          <span className="text-right w-16">{t('結餘')}</span>
        </div>
        {ids.map(id => {
          const v = net[id];
          const isGuest = guestIds.has(id);
          return (
            <div key={id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 text-xs">
              <span className="font-bold text-zinc-700 truncate flex items-center gap-1">
                {nameOf(id)}
                {isGuest && <span className="text-[9px] font-medium text-zinc-400">{t('（非 app 用戶）')}</span>}
                {isGuest && !used.has(id) && (
                  <button onClick={() => onRemoveGuest(id)} className="text-zinc-300 hover:text-red-500" title={t('移除')}>
                    <X size={11} />
                  </button>
                )}
              </span>
              <span className="text-right tabular-nums text-zinc-500">{money(paid[id] || 0)}</span>
              <span className="text-right tabular-nums text-zinc-500">{money(share[id] || 0)}</span>
              <span className={cn('text-right tabular-nums font-bold w-16', v > 0.5 ? 'text-emerald-600' : v < -0.5 ? 'text-red-500' : 'text-zinc-300')}>
                {v > 0.5 ? '+' : v < -0.5 ? '−' : ''}{money(v)}
              </span>
            </div>
          );
        })}
      </div>

      {split.length === 0 ? (
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('新增支出時選「付款人」和「平分給」，這裡就會算出每個人的結餘。')}</p>
      ) : transfers.length === 0 ? (
        <p className="text-xs text-zinc-400">{t('已經兩清')}</p>
      ) : (
        <div className="space-y-1.5">
          {transfers.map((tr, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-xs">
              <span className="text-zinc-700">
                <span className="font-bold">{nameOf(tr.from)}</span> → <span className="font-bold">{nameOf(tr.to)}</span>
              </span>
              <span className="font-bold text-zinc-900 tabular-nums">{money(tr.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={t('名字，例如 Julien')}
            className="flex-1 p-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:border-zinc-400"
          />
          <button onClick={submit} disabled={!name.trim()} className="px-3 bg-zinc-900 text-white rounded-xl text-xs font-bold disabled:opacity-40 flex items-center gap-1">
            <Plus size={12} /> {t('新增')}
          </button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900">
          <UserPlus size={13} /> {t('新增不在 app 上的人')}
        </button>
      )}
      <p className="text-[10px] text-zinc-400">{t('只計入有勾選平分對象的支出。+ 代表別人欠他，− 代表他要付。')}</p>
    </div>
  );
}
