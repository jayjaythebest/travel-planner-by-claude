import React, { createContext, useContext, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils';

/**
 * True inside an overview sub-tab: the tab already chose what to show, so a
 * block folded shut on an earlier visit would open the tab onto nothing.
 */
export const ForceOpen = createContext(false);
export const useForceOpen = () => useContext(ForceOpen);

/**
 * Open/closed state for one overview block, remembered per browser.
 *
 * Per section rather than per trip: someone who never reads the spending block
 * wants it closed on every trip. localStorage can be unavailable (private
 * windows), in which case the default simply applies every time.
 */
export function useCollapsed(id: string, defaultOpen: boolean): [boolean, () => void] {
  const key = `tp.section.${id}`;
  const forced = useContext(ForceOpen);
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
  return forced ? [true, () => {}] : [open, toggle];
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
  const forced = useForceOpen();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 min-w-0 text-sm font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
        >
          {!forced && <ChevronDown size={14} className={cn('flex-shrink-0 transition-transform', !open && '-rotate-90')} />}
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
