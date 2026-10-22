import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils';

/**
 * Open/closed state for one overview block, remembered per browser.
 *
 * Per section rather than per trip: someone who never reads the spending block
 * wants it closed on every trip. localStorage can be unavailable (private
 * windows), in which case the default simply applies every time.
 */
export function useCollapsed(id: string, defaultOpen: boolean): [boolean, () => void] {
  const key = `tp.section.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () =>
    setOpen(o => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch {}
      return !o;
    });
  return [open, toggle];
}

/** A titled overview block whose body can be folded away. `summary` shows while folded. */
export function Section({
  id,
  title,
  summary,
  right,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, toggle] = useCollapsed(id, defaultOpen);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 min-w-0 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
        >
          <ChevronDown size={14} className={cn('flex-shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate">{title}</span>
          {summary && (
            <span className="normal-case tracking-normal text-[11px] font-medium text-zinc-300 truncate">· {summary}</span>
          )}
        </button>
        {right}
      </div>
      {open && children}
    </div>
  );
}
