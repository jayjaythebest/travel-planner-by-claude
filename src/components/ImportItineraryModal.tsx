import React, { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { FileUp, Loader2, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { DestinationPicker } from './DestinationPicker';
import { geminiService } from '../services/geminiService';
import { COUNTRY_LIST } from '../utils';
import { t, useLang } from '../i18n';

/** What the review step edits. Days are offsets; real dates come from startDate. */
export type DraftActivity = {
  activity: string;
  start_time: string;
  end_time: string;
  note: string;
};

export type DraftDay = { day: number; activities: DraftActivity[] };

export type DraftAccommodation = {
  name: string;
  address: string;
  check_in_day: number;
  check_out_day: number;
};

export type ImportDraft = {
  name: string;
  country: string;
  /** YYYY-MM-DD. Day 1 lands here and every other day is derived from it. */
  startDate: string;
  dayCount: number;
  days: DraftDay[];
  accommodations: DraftAccommodation[];
  checklist: string[];
};

// Gemini takes the file inline, and the request carries it base64-encoded —
// roughly a third larger than the file. Well under the API's own ceiling, but
// large enough to be worth refusing before spending a minute on an upload that
// cannot succeed.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic'],
  'text/plain': ['.txt'],
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      if (comma < 0) {
        reject(new Error('unexpected data url'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Turn whatever the model returned into a draft that the UI can render.
 *
 * Written defensively on purpose: responseSchema constrains the shape but not
 * the values, so days can arrive out of order, times can come back as "9:00"
 * or "17:45" despite being asked for half-hour slots, and required fields can
 * be empty strings. Anything unusable is dropped here rather than allowed to
 * reach Firestore, because a malformed start_time becomes an all-day calendar
 * event three screens later with nothing pointing back to this function.
 */
function toDraft(raw: unknown, countries: string[]): ImportDraft {
  const r = (raw ?? {}) as Record<string, any>;

  const rawDays: DraftDay[] = Array.isArray(r.days)
    ? r.days
        .map((d: any) => ({
          day: Number(d?.day),
          activities: Array.isArray(d?.activities)
            ? d.activities
                .map((a: any) => ({
                  activity: String(a?.activity ?? '').trim(),
                  start_time: TIME_RE.test(String(a?.start_time)) ? String(a.start_time) : '',
                  end_time: TIME_RE.test(String(a?.end_time)) ? String(a.end_time) : '',
                  note: String(a?.note ?? '').trim(),
                }))
                .filter((a: DraftActivity) => a.activity !== '')
            : [],
        }))
        .filter((d: DraftDay) => Number.isFinite(d.day) && d.day >= 1)
        .sort((a: DraftDay, b: DraftDay) => a.day - b.day)
    : [];

  const dayCount = Math.max(
    Number.isFinite(Number(r.day_count)) ? Number(r.day_count) : 0,
    ...rawDays.map((d) => d.day),
    1,
  );

  // Only kept when the document actually stated a date. Empty is the normal
  // case — brochures say "Day One" — and the review step makes the user pick.
  const parsedStart = String(r.start_date ?? '').trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedStart) ? parsedStart : '';

  return {
    name: String(r.name ?? '').trim() || t('匯入的行程'),
    // The prompt hands the model the exact list, but a model can still answer
    // off-list. An unmatched country would miss TIMEZONE_MAP and CURRENCY_MAP,
    // so it is dropped and the user picks — an empty select is an obvious
    // prompt, where "Tanzania" silently behaving like Taipei is not.
    country: countries.includes(String(r.country)) ? String(r.country) : '',
    startDate,
    dayCount,
    days: rawDays,
    accommodations: Array.isArray(r.accommodations)
      ? r.accommodations
          .map((a: any) => ({
            name: String(a?.name ?? '').trim(),
            address: String(a?.address ?? '').trim(),
            check_in_day: Number(a?.check_in_day),
            check_out_day: Number(a?.check_out_day),
          }))
          .filter(
            (a: DraftAccommodation) =>
              a.name !== '' && Number.isFinite(a.check_in_day) && Number.isFinite(a.check_out_day),
          )
      : [],
    checklist: Array.isArray(r.checklist)
      ? r.checklist.map((c: any) => String(c ?? '').trim()).filter((c: string) => c !== '')
      : [],
  };
}

export function ImportItineraryModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (draft: ImportDraft) => Promise<void>;
}) {
  useLang();
  const [stage, setStage] = useState<'pick' | 'parsing' | 'review' | 'saving'>('pick');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [draft, setDraft] = useState<ImportDraft | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        setError(t('檔案 {mb} MB，超過 15 MB 上限。', { mb: (file.size / 1024 / 1024).toFixed(1) }));
        return;
      }
      setError('');
      setFileName(file.name);
      setStage('parsing');
      try {
        const base64 = await readAsBase64(file);
        const mimeType = file.type || 'application/pdf';
        const raw = await geminiService.parseItineraryFile(base64, mimeType, COUNTRY_LIST);
        const next = toDraft(raw, COUNTRY_LIST);
        if (next.days.every((d) => d.activities.length === 0)) {
          setError(t('讀得到檔案，但裡面找不到可以排進行程的活動。換一個檔案或手動建立旅程。'));
          setStage('pick');
          return;
        }
        setDraft(next);
        setStage('review');
      } catch (err) {
        console.error(err);
        setError(t('解析失敗，請確認檔案內容是行程表，或稍後再試。'));
        setStage('pick');
      }
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: false,
    disabled: stage !== 'pick',
  });

  const endDate = useMemo(() => {
    if (!draft || !draft.startDate) return '';
    const start = parseISO(draft.startDate);
    if (!isValid(start)) return '';
    return format(addDays(start, Math.max(draft.dayCount - 1, 0)), 'yyyy-MM-dd');
  }, [draft]);

  const activityCount = draft ? draft.days.reduce((n, d) => n + d.activities.length, 0) : 0;
  const ready = Boolean(draft && draft.name.trim() && draft.country && draft.startDate && endDate);

  const patch = (next: Partial<ImportDraft>) => setDraft((d) => (d ? { ...d, ...next } : d));

  const patchActivity = (dayIndex: number, actIndex: number, next: Partial<DraftActivity>) =>
    setDraft((d) => {
      if (!d) return d;
      const days = d.days.map((day, i) =>
        i !== dayIndex
          ? day
          : { ...day, activities: day.activities.map((a, j) => (j === actIndex ? { ...a, ...next } : a)) },
      );
      return { ...d, days };
    });

  const removeActivity = (dayIndex: number, actIndex: number) =>
    setDraft((d) => {
      if (!d) return d;
      const days = d.days.map((day, i) =>
        i !== dayIndex ? day : { ...day, activities: day.activities.filter((_, j) => j !== actIndex) },
      );
      return { ...d, days };
    });

  const confirm = async () => {
    if (!draft || !ready) return;
    setStage('saving');
    setError('');
    try {
      await onConfirm(draft);
      onClose();
    } catch (err) {
      console.error(err);
      setError(t('寫入失敗，沒有任何資料被建立。請再試一次。'));
      setStage('review');
    }
  };

  return (
    <Modal title={t('從檔案匯入行程')} onClose={onClose}>
      {(stage === 'pick' || stage === 'parsing') && (
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
              isDragActive ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200'
            } ${stage === 'parsing' ? 'opacity-60' : 'cursor-pointer hover:border-zinc-300'}`}
          >
            <input {...getInputProps()} />
            {stage === 'parsing' ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm font-bold">{t('AI 正在讀 {name}…', { name: fileName })}</p>
                <p className="text-xs">{t('整份行程手冊可能要等半分鐘')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <FileUp size={28} />
                <p className="text-sm font-bold text-zinc-700">{t('把行程檔拖進來，或點擊選擇')}</p>
                <p className="text-xs">{t('PDF、截圖、純文字都可以')}</p>
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {t('檔案會傳給 Gemini 解析。解析完會先讓你檢查與修改，')}
            <span className="font-bold text-zinc-500">{t('確認之後才會真的建立旅程')}</span>
            {t(' —— AI 讀出來的時間多半是它依活動性質推的，不是檔案裡寫的。')}
          </p>
        </div>
      )}

      {draft && (stage === 'review' || stage === 'saving') && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-bold text-zinc-600 mb-1">{t('旅程名稱')}</label>
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">{t('國家')}</label>
                <DestinationPicker
                  value={draft.country}
                  onChange={(country) => patch({ country })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-600 mb-1">{t('出發日期')}</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => patch({ startDate: e.target.value })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {t('共 {days} 天、{n} 筆活動', { days: draft.dayCount, n: activityCount })}
              {endDate ? ` · ${draft.startDate} ~ ${endDate}` : t(' · 選了出發日期才能算出結束日')}
            </p>
          </div>

          <div className="space-y-4">
            {draft.days.map((day, dayIndex) => (
              <div key={day.day} className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                  Day {day.day}
                  {draft.startDate && isValid(parseISO(draft.startDate))
                    ? ` · ${format(addDays(parseISO(draft.startDate), day.day - 1), 'MM/dd')}`
                    : ''}
                </h4>
                {day.activities.length === 0 && (
                  <p className="text-xs text-zinc-300 pl-1">{t('（這天沒有活動）')}</p>
                )}
                {day.activities.map((a, actIndex) => (
                  <div
                    key={actIndex}
                    className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={a.activity}
                        onChange={(e) => patchActivity(dayIndex, actIndex, { activity: e.target.value })}
                        className="flex-1 p-2 bg-white border border-zinc-200 rounded-lg text-sm font-bold"
                      />
                      <button
                        onClick={() => removeActivity(dayIndex, actIndex)}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                        title={t('移除這筆')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        step={1800}
                        value={a.start_time}
                        onChange={(e) => patchActivity(dayIndex, actIndex, { start_time: e.target.value })}
                        className="p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                      />
                      <span className="text-zinc-300 text-xs">→</span>
                      <input
                        type="time"
                        step={1800}
                        value={a.end_time}
                        onChange={(e) => patchActivity(dayIndex, actIndex, { end_time: e.target.value })}
                        className="p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                      />
                    </div>
                    {a.note && <p className="text-[11px] text-zinc-500 leading-relaxed">{a.note}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {draft.accommodations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('住宿')}</h4>
              {draft.accommodations.map((acc, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 p-3 bg-zinc-50 border border-zinc-100 rounded-xl"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-zinc-800 truncate">{acc.name}</div>
                    <div className="text-[11px] text-zinc-400">
                      Day {acc.check_in_day} → Day {acc.check_out_day}
                      {acc.address ? ` · ${acc.address}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      patch({ accommodations: draft.accommodations.filter((_, j) => j !== i) })
                    }
                    className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {draft.checklist.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('準備清單')}</h4>
              {draft.checklist.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 p-2.5 bg-zinc-50 border border-zinc-100 rounded-xl"
                >
                  <span className="text-xs text-zinc-700">{item}</span>
                  <button
                    onClick={() => patch({ checklist: draft.checklist.filter((_, j) => j !== i) })}
                    className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

          <button
            onClick={confirm}
            disabled={!ready || stage === 'saving'}
            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {stage === 'saving' && <Loader2 size={16} className="animate-spin" />}
            {stage === 'saving' ? t('建立中…') : t('確認建立（{n} 筆活動）', { n: activityCount })}
          </button>
          {!ready && stage === 'review' && (
            <p className="text-[11px] text-zinc-400 text-center">{t('名稱、國家、出發日期都填了才能建立')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
