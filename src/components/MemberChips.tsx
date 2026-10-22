import React from 'react';
import { cn } from '../utils';
import { User } from '../types';

/** Tap-to-toggle chips for picking trip members, by uid. */
export function MemberChips({
  members,
  value,
  onChange,
}: {
  members: User[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map(u => {
        const on = value.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onChange(on ? value.filter(id => id !== u.id) : [...value, u.id])}
            className={cn(
              'text-xs font-bold px-2.5 py-1 rounded-full border transition-colors',
              on ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-400 border-zinc-200',
            )}
          >
            {u.username.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}
