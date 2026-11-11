import React, { useState } from 'react';
import { Loader2, Check, Clock, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Modal } from './Modal';
import { MemberChips } from './MemberChips';
import { t, useLang } from '../i18n';
import { NotifyRequest, Trip, User } from '../types';

/**
 * Pick members and queue an email asking them to check the itinerary. The
 * reservation-agent sends it within ~10 minutes, so the list below shows each
 * request as queued until it stamps the result.
 */
export function NotifyMembersModal({
  trip,
  members,
  me,
  nameOf,
  onClose,
  onSend,
}: {
  trip: Trip;
  members: User[];
  me: string;
  nameOf: (uid: string) => string;
  onClose: () => void;
  onSend: (to: string[], message: string) => Promise<void>;
}) {
  useLang();
  const others = members.filter(u => u.id !== me);
  const [to, setTo] = useState<string[]>(() => others.filter(u => u.email).map(u => u.id));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const noEmail = others.filter(u => !u.email);

  const history = Object.entries(trip.notify_requests ?? {})
    .sort(([, a], [, b]) => b.requested_at.localeCompare(a.requested_at))
    .slice(0, 5);

  const send = async () => {
    setBusy(true);
    try {
      await onSend(to, message.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('通知成員確認行程')} onClose={onClose}>
      <div className="space-y-5">
        {others.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('這趟旅程還沒有其他成員。')}</p>
        ) : (
          <>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('寄給')}</label>
              <div className="mt-2">
                <MemberChips members={others.filter(u => u.email)} value={to} onChange={setTo} />
              </div>
              {noEmail.length > 0 && (
                <p className="text-[11px] text-zinc-400 mt-2">
                  {t('{names} 的個人資料沒有 email，無法通知', { names: noEmail.map(u => u.username).join(', ') })}
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('附加訊息（選填）')}</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={3}
                placeholder={t('例如：Day 2 的晚餐改了，麻煩看一下')}
                className="mt-2 w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
            <button
              onClick={send}
              disabled={busy || to.length === 0}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {t('寄出通知（{n} 人）', { n: to.length })}
            </button>
            <p className="text-[11px] text-zinc-400 text-center -mt-3">{t('系統會在 10 分鐘內寄出')}</p>
          </>
        )}

        {history.length > 0 && (
          <div className="border-t border-zinc-100 pt-4 space-y-2">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('最近的通知')}</div>
            {history.map(([id, r]) => (
              <HistoryRow key={id} r={r} nameOf={nameOf} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function HistoryRow({ r, nameOf }: { r: NotifyRequest; nameOf: (uid: string) => string }) {
  const status = r.error
    ? { icon: <AlertCircle size={13} className="text-red-500" />, text: t('寄送失敗') }
    : r.sent_at
      ? { icon: <Check size={13} className="text-emerald-500" />, text: t('已寄出 {at}', { at: format(parseISO(r.sent_at), 'MM/dd HH:mm') }) }
      : { icon: <Clock size={13} className="text-amber-500" />, text: t('排隊中') };
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5">{status.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-zinc-700 truncate">{r.to.map(nameOf).join(', ')}</div>
        <div className="text-zinc-400">
          {format(parseISO(r.requested_at), 'MM/dd HH:mm')} · {nameOf(r.from)} · {status.text}
          {r.skipped && r.skipped.length > 0 && ` · ${t('略過 {names}（無 email）', { names: r.skipped.map(nameOf).join(', ') })}`}
        </div>
      </div>
    </div>
  );
}
