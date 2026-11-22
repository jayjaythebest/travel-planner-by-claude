import { FileText } from 'lucide-react';
import type { TripDocument } from '../types';
import { cn } from '../utils';
import { t } from '../i18n';

/** Drive links for a card's ticket PDFs; one per traveller when each has their own. */
export function DocLinks({ docs, className }: { docs: TripDocument[]; className?: string }) {
  if (docs.length === 0) return null;
  // One ticket per traveller reads best by name; several papers for one person by file.
  const byPassenger = new Set(docs.map(d => d.passenger)).size === docs.length && docs.every(d => d.passenger);
  const label = (d: TripDocument) => docs.length === 1 ? t('票券')
    : byPassenger ? d.passenger
    : d.name.replace(/\.pdf$/i, '').slice(0, 24);
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {docs.map(d => (
        <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={d.name}
          className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline">
          <FileText size={11} />
          {label(d)}
        </a>
      ))}
    </span>
  );
}
