import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  MapPin,
  Trash2,
  Loader2,
  ClipboardPaste,
  Check,
  CalendarPlus,
  ChevronDown,
  Lightbulb,
  ImagePlus,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { geminiService } from '../services/geminiService';
import { cn } from '../utils';
import { Trip, Activity, Idea, IdeaPhoto, User } from '../types';
import { t, useLang } from '../i18n';

const CATEGORY_META: Record<Idea['category'], { icon: string; label: string; chip: string }> = {
  restaurant: { icon: '🍽', label: '餐廳', chip: 'text-rose-600 bg-rose-50 border-rose-100' },
  cafe: { icon: '☕', label: '咖啡廳', chip: 'text-amber-700 bg-amber-50 border-amber-200' },
  landmark: { icon: '🏛', label: '景點', chip: 'text-blue-600 bg-blue-50 border-blue-100' },
  shopping: { icon: '🛍', label: '購物', chip: 'text-purple-600 bg-purple-50 border-purple-100' },
  stay: { icon: '🏨', label: '住宿', chip: 'text-teal-700 bg-teal-50 border-teal-100' },
  other: { icon: '✨', label: '其他', chip: 'text-stone-600 bg-stone-100 border-stone-200' },
};

/** Gemini is told to return one of these, but it is a string on the wire. */
function normalizeCategory(raw: unknown): Idea['category'] {
  const c = String(raw || '').toLowerCase();
  return c === 'restaurant' || c === 'cafe' || c === 'landmark' || c === 'shopping' ? c : 'other';
}

/**
 * Shrink a picked image to a JPEG data URL that fits in one Firestore document.
 *
 * The cap is on the encoded string, not the file: a data URL is ~4/3 the size
 * of its bytes and the document also carries a few small fields, so 900k
 * characters keeps clear of the 1 MiB limit. Quality steps down first because
 * it costs less detail than shrinking the dimensions does.
 */
const MAX_DATA_URL = 900_000;
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(t('無法讀取這張圖片')));
      el.src = url;
    });
    for (const maxSide of [1600, 1280, 960]) {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.6]) {
        const out = canvas.toDataURL('image/jpeg', q);
        if (out.length <= MAX_DATA_URL) return out;
      }
    }
    throw new Error(t('圖片太大，壓縮後仍超過上限'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Candidate = {
  title: string;
  category: Idea['category'];
  area: string;
  note: string;
  duration: string;
  /** Unticked candidates are dropped — the review step is the point. */
  picked: boolean;
};

type Suggestion = { date: string; suggestedTime?: string; reason: string };

export function IdeaStash({
  trip,
  ideas,
  activities,
  dates,
  currentUser,
  onJumpToDay,
}: {
  trip: Trip;
  ideas: Idea[];
  activities: Activity[];
  dates: string[];
  currentUser: User | null;
  onJumpToDay: (date: string) => void;
}) {
  useLang();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteSource, setPasteSource] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [saving, setSaving] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualCategory, setManualCategory] = useState<Idea['category']>('landmark');

  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState('');
  /** Keyed by idea id, not by title — titles are not unique and ids are. */
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});

  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(dates[0] || '');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);

  const [photos, setPhotos] = useState<IdeaPhoto[]>([]);
  const [manualFiles, setManualFiles] = useState<File[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [viewer, setViewer] = useState<IdeaPhoto | null>(null);
  /** Category the list is narrowed to from the summary row; null shows all. */
  const [filter, setFilter] = useState<Idea['category'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Which idea the shared hidden file input is currently picking for. */
  const uploadTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'idea_photos'), where('trip_id', '==', trip.id));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ ...d.data(), id: d.id })) as IdeaPhoto[];
      rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      setPhotos(rows);
    });
  }, [trip.id]);

  const photosFor = (ideaId: string) => photos.filter(p => p.idea_id === ideaId);

  const open = ideas.filter(i => i.status !== 'scheduled');
  const counts = (Object.keys(CATEGORY_META) as Idea['category'][])
    .map(k => ({ k, n: open.filter(i => (CATEGORY_META[i.category] ? i.category : 'other') === k).length }))
    .filter(c => c.n > 0);
  const shown = filter ? open.filter(i => (CATEGORY_META[i.category] ? i.category : 'other') === filter) : open;
  const scheduled = ideas.filter(i => i.status === 'scheduled');

  const mapUrlFor = (title: string, area?: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [title, area, trip.country].filter(Boolean).join(' '),
    )}`;

  // ── AI extraction ──────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setExtractError('');
    setCandidates(null);
    try {
      const raw = await geminiService.extractIdeasFromText(
        pasteText.trim(),
        trip.country,
        ideas.map(i => i.title),
      );
      if (raw.length === 0) {
        setExtractError(t('這段文字裡沒有找到具體的地點，可以試試貼多一點內容。'));
      } else {
        setCandidates(
          raw.map((r: any) => ({
            title: String(r.title || '').trim(),
            category: normalizeCategory(r.category),
            area: String(r.area || '').trim(),
            note: String(r.note || '').trim(),
            duration: String(r.duration || '').trim(),
            picked: true,
          })).filter((c: Candidate) => c.title),
        );
      }
    } catch (err) {
      console.error(err);
      setExtractError(t('AI 讀取失敗，請稍後再試一次。'));
    }
    setExtracting(false);
  };

  const handleSaveCandidates = async () => {
    if (!candidates) return;
    const picked = candidates.filter(c => c.picked);
    if (picked.length === 0) return;
    setSaving(true);
    try {
      // Sequential rather than Promise.all: the stash is small and a partial
      // failure halfway through is easier to reason about than a scatter.
      for (const c of picked) {
        await addDoc(collection(db, 'ideas'), {
          trip_id: trip.id,
          title: c.title,
          category: c.category,
          area: c.area,
          note: c.note,
          duration: c.duration,
          map_url: mapUrlFor(c.title, c.area),
          source: pasteSource.trim() || '貼上的文字',
          created_by: currentUser?.username || '—',
          created_at: new Date().toISOString(),
          status: 'idea',
        });
      }
      setCandidates(null);
      setPasteText('');
      setPasteSource('');
      setPasteOpen(false);
    } catch (err) {
      console.error(err);
      setExtractError(t('儲存失敗，請再試一次。'));
    }
    setSaving(false);
  };

  const uploadPhotos = async (ideaId: string, files: File[]) => {
    if (files.length === 0) return;
    setUploadingId(ideaId);
    setPhotoError('');
    let failed = 0;
    // One at a time: each is a canvas re-encode of a phone-sized photo, and
    // decoding several at once is what makes a phone's tab reload itself.
    for (const file of files) {
      try {
        const data_url = await compressImage(file);
        await addDoc(collection(db, 'idea_photos'), {
          trip_id: trip.id,
          idea_id: ideaId,
          data_url,
          created_by: currentUser?.username || '—',
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error(err);
        failed++;
      }
    }
    if (failed) setPhotoError(t('{n} 張照片上傳失敗，請再試一次。', { n: failed }));
    setUploadingId(null);
  };

  const pickPhotosFor = (ideaId: string) => {
    uploadTargetRef.current = ideaId;
    fileInputRef.current?.click();
  };

  const handleDeletePhoto = async (id: string) => {
    await deleteDoc(doc(db, 'idea_photos', id));
    setViewer(null);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    const ref = await addDoc(collection(db, 'ideas'), {
      trip_id: trip.id,
      title: manualTitle.trim(),
      category: manualCategory,
      area: '',
      note: manualNote.trim(),
      duration: '',
      map_url: mapUrlFor(manualTitle.trim()),
      source: '手動',
      created_by: currentUser?.username || '—',
      created_at: new Date().toISOString(),
      status: 'idea',
    });
    const files = manualFiles;
    setManualTitle('');
    setManualNote('');
    setManualFiles([]);
    setManualOpen(false);
    await uploadPhotos(ref.id, files);
  };

  // ── AI day suggestions for the whole stash ─────────────────────────────
  const handleAdvise = async () => {
    if (open.length === 0) return;
    setAdviceLoading(true);
    setAdviceError('');
    try {
      const dayPlans = dates.map((date, i) => ({
        date,
        day: i + 1,
        activities: activities
          .filter(a => a.date === date)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .map(a => a.activity),
      }));
      const res = await geminiService.getStashSuggestions(
        { country: trip.country, start_date: trip.start_date, end_date: trip.end_date },
        dayPlans,
        open.map(i => ({ title: i.title, area: i.area, category: i.category, duration: i.duration })),
      );
      const next: Record<string, Suggestion> = {};
      for (const s of res) {
        // `ref` is the 1-based position in the list that was sent, which is
        // `open` in this same order. A suggestion for a day outside the trip is
        // dropped rather than shown: it would point at a tab that does not exist.
        const idea = open[Number(s.ref) - 1];
        if (!idea || !dates.includes(s.date)) continue;
        next[idea.id] = { date: s.date, suggestedTime: s.suggestedTime, reason: s.reason };
      }
      if (Object.keys(next).length === 0) {
        setAdviceError(t('AI 這次沒有給出可用的建議，可以先手動安排幾天再試。'));
      }
      setSuggestions(next);
    } catch (err) {
      console.error(err);
      setAdviceError(t('AI 建議失敗，請稍後再試。'));
    }
    setAdviceLoading(false);
  };

  // ── Idea -> Activity ───────────────────────────────────────────────────
  const placeIdea = async (idea: Idea, date: string, time: string) => {
    setPlacingId(idea.id);
    try {
      const docRef = await addDoc(collection(db, 'activities'), {
        trip_id: trip.id,
        date,
        start_time: time,
        end_time: '',
        activity: idea.title,
        map_url: idea.map_url || mapUrlFor(idea.title, idea.area),
        note: idea.note || '',
        is_flight: false,
        travel_mode: 'transit' as const,
        ai_advice: '',
        photo_url: '',
        travel_time_to_next: '',
      });

      // Same enrichment the 今日需求 flow uses: fire and forget, because the
      // activity is already usable and these two calls take seconds.
      geminiService
        .getItineraryAdvice(idea.title, trip.country)
        .then(advice => { if (advice) updateDoc(docRef, { ai_advice: advice }); })
        .catch(() => {});
      geminiService
        .getActivityPhoto(idea.title, trip.country)
        .then(photoUrl => { if (photoUrl) updateDoc(docRef, { photo_url: photoUrl }); })
        .catch(() => {});

      await updateDoc(doc(db, 'ideas', idea.id), { status: 'scheduled', scheduled_date: date });
      setSchedulingId(null);
      setSuggestions(s => { const { [idea.id]: _drop, ...rest } = s; return rest; });
    } catch (err) {
      console.error(err);
    }
    setPlacingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'ideas', id));
    // Orphaned photos would never be shown again but would still ride along
    // in every snapshot of this trip's photo collection.
    await Promise.all(photosFor(id).map(p => deleteDoc(doc(db, 'idea_photos', p.id))));
  };

  const handleUnschedule = async (id: string) => {
    await updateDoc(doc(db, 'ideas', id), { status: 'idea', scheduled_date: '' });
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (uploadTargetRef.current) uploadPhotos(uploadTargetRef.current, files);
        }}
      />
      <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-violet-50 via-white to-white border-b border-zinc-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
              <Lightbulb size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 leading-tight">{t('靈感暫存區')}</h3>
              <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                {t('想去但還沒決定哪天的地方 · {n} 個待安排', { n: open.length })}
              </p>
            </div>
          </div>
          {open.length > 0 && (
            <button
              onClick={handleAdvise}
              disabled={adviceLoading}
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-violet-600 text-white shadow-sm active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
            >
              {adviceLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {adviceLoading ? t('安排中') : t('AI 建議安排')}
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setPasteOpen(o => !o); setManualOpen(false); }}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors',
              pasteOpen
                ? 'bg-violet-100 text-violet-700 border-violet-200'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-violet-200 hover:text-violet-600',
            )}
          >
            <ClipboardPaste size={11} /> {t('貼上網站內容')}
          </button>
          <button
            onClick={() => { setManualOpen(o => !o); setPasteOpen(false); }}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors',
              manualOpen
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300',
            )}
          >
            <Plus size={11} /> {t('手動新增')}
          </button>
        </div>

        {counts.length > 1 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {counts.map(({ k, n }) => (
              <button
                key={k}
                onClick={() => setFilter(filter === k ? null : k)}
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors',
                  filter === k ? CATEGORY_META[k].chip : filter ? 'bg-white text-zinc-300 border-zinc-100' : CATEGORY_META[k].chip,
                )}
              >
                {CATEGORY_META[k].icon} {t(CATEGORY_META[k].label)} {n}
              </button>
            ))}
            {filter && (
              <button onClick={() => setFilter(null)} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-700 px-1">
                {t('顯示全部')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Paste + extract ── */}
      <AnimatePresence initial={false}>
        {pasteOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-zinc-100"
          >
            <div className="p-4 space-y-2.5 bg-violet-50/30">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={5}
                placeholder={t('把部落格、網站或朋友傳來的文字整段貼進來，AI 會挑出裡面提到的地點…')}
                className="w-full text-sm px-3 py-2.5 bg-white border border-violet-100 rounded-xl focus:border-violet-300 outline-none placeholder:text-zinc-300 resize-y leading-relaxed"
              />
              <input
                value={pasteSource}
                onChange={e => setPasteSource(e.target.value)}
                placeholder={t('來源網址（選填，之後可以點回去看原文）')}
                className="w-full text-xs px-3 py-2 bg-white border border-violet-100 rounded-xl focus:border-violet-300 outline-none placeholder:text-zinc-300"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExtract}
                  disabled={!pasteText.trim() || extracting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl font-bold text-xs disabled:opacity-40 hover:bg-violet-700 transition-colors"
                >
                  {extracting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {extracting ? t('擷取中…') : t('AI 擷取地點')}
                </button>
                <span className="text-[10px] text-zinc-400">{t('擷取後可以勾選要收藏的項目')}</span>
              </div>
              {extractError && <p className="text-[11px] text-red-500 font-medium">{extractError}</p>}

              {candidates && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      {t('找到 {n} 個地點', { n: candidates.length })}
                    </span>
                    <button
                      onClick={() =>
                        setCandidates(cs =>
                          cs ? cs.map(c => ({ ...c, picked: !cs.every(x => x.picked) })) : cs,
                        )
                      }
                      className="text-[10px] font-bold text-violet-600 hover:underline"
                    >
                      {candidates.every(c => c.picked) ? t('全部取消') : t('全選')}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {candidates.map((c, i) => {
                      const meta = CATEGORY_META[c.category];
                      return (
                        <button
                          key={`${c.title}-${i}`}
                          onClick={() =>
                            setCandidates(cs =>
                              cs ? cs.map((x, xi) => (xi === i ? { ...x, picked: !x.picked } : x)) : cs,
                            )
                          }
                          className={cn(
                            'w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors',
                            c.picked ? 'bg-white border-violet-200' : 'bg-zinc-50 border-zinc-100 opacity-50',
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5',
                              c.picked ? 'bg-violet-600 border-violet-600 text-white' : 'border-zinc-300 bg-white',
                            )}
                          >
                            {c.picked && <Check size={11} strokeWidth={3} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-zinc-900">{c.title}</span>
                              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', meta.chip)}>
                                {meta.icon} {t(meta.label)}
                              </span>
                            </div>
                            {c.note && <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{c.note}</p>}
                            <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-400">
                              {c.area && <span className="flex items-center gap-0.5"><MapPin size={8} />{c.area}</span>}
                              {c.duration && <span>⏱ {c.duration}</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleSaveCandidates}
                    disabled={saving || candidates.every(c => !c.picked)}
                    className="w-full py-2.5 bg-zinc-900 text-white rounded-xl font-bold text-xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    {t('加入收藏（{n}）', { n: candidates.filter(c => c.picked).length })}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Manual add ── */}
      <AnimatePresence initial={false}>
        {manualOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-zinc-100"
          >
            <form onSubmit={handleManualAdd} className="p-4 space-y-2.5 bg-zinc-50/60">
              <input
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                placeholder={t('地點名稱')}
                className="w-full text-sm px-3 py-2 bg-white border border-zinc-200 rounded-xl outline-none focus:border-zinc-400 placeholder:text-zinc-300"
              />
              <input
                value={manualNote}
                onChange={e => setManualNote(e.target.value)}
                placeholder={t('為什麼想去？（選填）')}
                className="w-full text-xs px-3 py-2 bg-white border border-zinc-200 rounded-xl outline-none focus:border-zinc-400 placeholder:text-zinc-300"
              />
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 cursor-pointer w-fit hover:text-zinc-800">
                <ImagePlus size={13} />
                {manualFiles.length ? t('已選 {n} 張照片', { n: manualFiles.length }) : t('附上照片（選填）')}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { setManualFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
                />
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(CATEGORY_META) as Idea['category'][]).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setManualCategory(k)}
                    className={cn(
                      'text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors',
                      manualCategory === k ? CATEGORY_META[k].chip : 'bg-white text-zinc-400 border-zinc-200',
                    )}
                  >
                    {CATEGORY_META[k].icon} {t(CATEGORY_META[k].label)}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={!manualTitle.trim()}
                className="w-full py-2.5 bg-zinc-900 text-white rounded-xl font-bold text-xs disabled:opacity-40"
              >
                {t('加入收藏')}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {photoError && (
        <p className="px-4 pt-3 text-[11px] text-red-500 font-medium">{photoError}</p>
      )}

      {adviceError && (
        <p className="px-4 pt-3 text-[11px] text-amber-600 font-medium">{adviceError}</p>
      )}

      {/* ── The stash itself ── */}
      <div className="p-4 space-y-2">
        {open.length === 0 && scheduled.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-400 font-medium">{t('還沒有收藏任何地點')}</p>
            <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
              {t('看到想去的地方就先丟進來，')}<br />{t('哪一天去之後再決定')}
            </p>
          </div>
        )}

        {shown.map(idea => {
          const meta = CATEGORY_META[idea.category] || CATEGORY_META.other;
          const sug = suggestions[idea.id];
          const isScheduling = schedulingId === idea.id;
          return (
            <motion.div
              key={idea.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-zinc-200 bg-white overflow-hidden group"
            >
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 leading-snug">{idea.title}</span>
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', meta.chip)}>
                        {meta.icon} {t(meta.label)}
                      </span>
                    </div>
                    {idea.note && <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{idea.note}</p>}
                    <div className="flex items-center gap-2.5 mt-1.5 text-[9px] text-zinc-400 flex-wrap">
                      {idea.area && <span className="flex items-center gap-0.5"><MapPin size={8} />{idea.area}</span>}
                      {idea.duration && <span>⏱ {idea.duration}</span>}
                      <span>{t('由 {name} 加入', { name: idea.created_by })}</span>
                    </div>
                    {(photosFor(idea.id).length > 0 || uploadingId === idea.id) && (
                      <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-0.5">
                        {photosFor(idea.id).map(p => (
                          <button
                            key={p.id}
                            onClick={() => setViewer(p)}
                            className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-100"
                          >
                            <img src={p.data_url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                        {uploadingId === idea.id && (
                          <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-zinc-50 border border-dashed border-zinc-200 flex items-center justify-center">
                            <Loader2 size={14} className="animate-spin text-zinc-400" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(idea.id)}
                    className="p-1.5 text-zinc-300 hover:text-red-500 transition-colors flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* AI suggestion banner */}
                {sug && !isScheduling && (
                  // Opacity and slide only. Animating height to 'auto' here left
                  // the box measured at one line while its text and button spilled
                  // over the action row beneath it — the banner is small enough
                  // that the height animation was buying nothing anyway.
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2.5 rounded-xl bg-violet-50 border border-violet-100 p-2.5"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles size={10} className="text-violet-500" />
                      <span className="text-[10px] font-bold text-violet-700">
                        {t('建議排在 Day {n}', { n: dates.indexOf(sug.date) + 1 })}
                        <span className="font-normal opacity-70 ml-1">
                          （{format(parseISO(sug.date), 'M/d')}{sug.suggestedTime ? ` ${sug.suggestedTime}` : ''}）
                        </span>
                      </span>
                    </div>
                    <p className="text-[10px] text-violet-900/70 leading-relaxed">{sug.reason}</p>
                    <button
                      onClick={() => placeIdea(idea, sug.date, sug.suggestedTime || '12:00')}
                      disabled={placingId === idea.id}
                      className="mt-2 flex items-center gap-1 text-[10px] font-bold text-white bg-violet-600 px-2.5 py-1 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      {placingId === idea.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                      {t('就這樣排')}
                    </button>
                  </motion.div>
                )}

                <div className="flex items-center gap-3 mt-2.5">
                  <a
                    href={idea.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-amber-600 transition-colors"
                  >
                    <MapPin size={10} /> {t('地圖')}
                  </a>
                  <button
                    onClick={() => pickPhotosFor(idea.id)}
                    disabled={uploadingId !== null}
                    className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-teal-600 transition-colors disabled:opacity-40"
                  >
                    <ImagePlus size={10} /> {t('照片')}
                  </button>
                  {idea.source?.startsWith('http') && (
                    <a
                      href={idea.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-zinc-400 hover:text-zinc-700 transition-colors"
                    >
                      {t('原文')}
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setSchedulingId(isScheduling ? null : idea.id);
                      setScheduleDate(sug?.date || dates[0] || '');
                      setScheduleTime(sug?.suggestedTime || '12:00');
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-zinc-600 hover:text-violet-600 transition-colors ml-auto"
                  >
                    <CalendarPlus size={11} /> {t('排進行程')}
                  </button>
                </div>

                {/* Inline day picker */}
                <AnimatePresence>
                  {isScheduling && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {/* Two rows rather than one. On a phone, a single row left
                          the time field about 80px wide, and a browser rendering
                          a 12-hour clock clipped the AM/PM off the end — 17:00
                          and 05:00 looked identical. */}
                      <div className="mt-2.5 pt-2.5 border-t border-zinc-100 space-y-2">
                        <div className="flex items-end gap-2">
                          <div className="flex-1 min-w-0">
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('哪一天')}</label>
                            <select
                              value={scheduleDate}
                              onChange={e => setScheduleDate(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg outline-none"
                            >
                              {dates.map((d, i) => (
                                <option key={d} value={d}>
                                  Day {i + 1}（{format(parseISO(d), 'M/d')}）
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="w-32 flex-shrink-0">
                            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{t('時間')}</label>
                            <input
                              type="time"
                              value={scheduleTime}
                              onChange={e => setScheduleTime(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => placeIdea(idea, scheduleDate, scheduleTime)}
                            disabled={!scheduleDate || placingId === idea.id}
                            className="flex-1 py-2 bg-zinc-900 text-white rounded-lg font-bold text-xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            {placingId === idea.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            {t('確認加入')}
                          </button>
                          <button
                            onClick={() => setSchedulingId(null)}
                            className="px-3 py-2 text-zinc-400 hover:text-zinc-700 text-xs font-bold flex-shrink-0"
                          >
                            {t('取消')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {/* ── Already scheduled ── */}
        {scheduled.length > 0 && (
          <div className="pt-1">
            <button
              onClick={() => setShowScheduled(s => !s)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
            >
              {t('已排進行程（{n}）', { n: scheduled.length })}
              <ChevronDown size={12} className={cn('transition-transform', showScheduled && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {showScheduled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5 pt-2">
                    {scheduled.map(idea => {
                      const dayIdx = idea.scheduled_date ? dates.indexOf(idea.scheduled_date) : -1;
                      return (
                        <div
                          key={idea.id}
                          className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100"
                        >
                          <Check size={12} className="text-emerald-500 flex-shrink-0" />
                          <span className="text-xs font-bold text-zinc-500 line-through flex-1 min-w-0 truncate">
                            {idea.title}
                          </span>
                          {dayIdx >= 0 ? (
                            <button
                              onClick={() => onJumpToDay(idea.scheduled_date!)}
                              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 transition-colors flex-shrink-0"
                            >
                              Day {dayIdx + 1} →
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnschedule(idea.id)}
                              className="text-[10px] font-bold text-zinc-400 hover:text-violet-600 transition-colors flex-shrink-0"
                            >
                              {t('放回收藏')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(idea.id)}
                            className="p-1 text-zinc-300 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewer(null)}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          >
            <img
              src={viewer.data_url}
              alt=""
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="flex items-center gap-4 mt-4 text-xs text-white/70" onClick={e => e.stopPropagation()}>
              <span>{t('由 {name} 上傳', { name: viewer.created_by })}</span>
              <button
                onClick={() => handleDeletePhoto(viewer.id)}
                className="flex items-center gap-1 font-bold text-red-300 hover:text-red-400"
              >
                <Trash2 size={12} /> {t('刪除')}
              </button>
              <button onClick={() => setViewer(null)} className="flex items-center gap-1 font-bold hover:text-white">
                <X size={12} /> {t('關閉')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
