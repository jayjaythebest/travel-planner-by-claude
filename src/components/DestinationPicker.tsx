import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { DESTINATIONS } from '../utils';

/**
 * A type-to-search replacement for the country `<select>`.
 *
 * A native select has type-ahead, but it only matches from the first character
 * of the option text — with the list past fifty entries, reaching 西班牙 meant
 * scrolling. This filters on the label and on `keywords`, so "spain", "西班
 * 牙" and "barcelona" all land on the same row.
 *
 * `name` renders a hidden input so the two forms that read this through
 * `FormData.get('country')` keep working; a custom component with no hidden
 * input would submit an empty country and the trip would lose its theme,
 * currency and time zone at once.
 */
export function DestinationPicker({
  value,
  onChange,
  name,
  placeholder = '搜尋國家…',
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return DESTINATIONS;
    return DESTINATIONS.filter((d) => {
      if (d.label.toLowerCase().includes(q)) return true;
      return (d.keywords ?? []).some((k) => k.toLowerCase().includes(q));
    });
  }, [queryText]);

  // Clamp rather than reset: the list shrinks as the user types, and a
  // highlight left pointing past the end would make Enter select nothing.
  useEffect(() => {
    setHighlight((h) => (h >= matches.length ? 0 : h));
  }, [matches.length]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQueryText('');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const commit = (label: string) => {
    onChange(label);
    setOpen(false);
    setQueryText('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      // Only swallow Enter while a choice is actually being made — otherwise it
      // belongs to the surrounding form, which submits on it.
      if (open && matches[highlight]) {
        e.preventDefault();
        commit(matches[highlight].label);
      }
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setQueryText('');
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQueryText('');
        }}
        onKeyDown={onKeyDown}
        className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-left flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-zinc-900' : 'text-zinc-400'}>{value || '請選擇國家'}</span>
        <ChevronDown size={16} className="text-zinc-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100">
            <Search size={14} className="text-zinc-400 flex-shrink-0" />
            {/* autoFocus, not a focus() call after open: React focuses this on
                mount, whereas focusing from the button's own click handler
                raced the render and left the box unfocused — the dropdown
                opened and the first thing typed went nowhere. */}
            <input
              autoFocus
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-400 text-center">找不到「{queryText}」</p>
            )}
            {matches.map((d, i) => (
              <button
                key={d.label}
                type="button"
                onClick={() => commit(d.label)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 ${
                  i === highlight ? 'bg-zinc-100' : 'bg-white'
                }`}
              >
                <span className="text-zinc-800">{d.label}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-zinc-400">{d.currency}</span>
                  {d.label === value && <Check size={14} className="text-zinc-900" />}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
