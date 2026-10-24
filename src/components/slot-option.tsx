import { ArrowUpRight, Check } from 'lucide-react';
import type { Candidate } from '@/features/scheduling/rank';
import { formatDemoRange, type DemoPerson } from '@/features/demo/scenario';
import { GroupAvatars } from './group-avatars';

export function SlotOption({ slot, people, index, selected, timeZone, onSelect }: {
  slot: Candidate; people: DemoPerson[]; index: number; selected: boolean; timeZone: string; onSelect: () => void;
}) {
  const everyone = slot.freeIds.length === people.length;
  const unknown = people.filter(person => slot.unknownIds.includes(person.id)).map(person => person.name);
  const busy = people.filter(person => slot.busyIds.includes(person.id)).map(person => person.name);
  return (
    <button className={`slot-option${selected ? ' slot-option--selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <span className="slot-number">{selected ? <Check size={16} strokeWidth={2.3} /> : index + 1}</span>
      <span className="slot-option-content">
        <span className="slot-time">{formatDemoRange(slot, timeZone)}</span>
        <span className="slot-attendance">{everyone ? 'Everyone is free' : `${slot.freeIds.length} of ${people.length} free`}{busy.length > 0 ? ` · not ${busy.join(', ')}` : ''}{unknown.length > 0 ? ` · ${unknown.join(', ')} unknown` : ''}</span>
      </span>
      <span className="slot-option-end"><GroupAvatars people={people} freeIds={slot.freeIds} small /><ArrowUpRight size={17} /></span>
    </button>
  );
}
