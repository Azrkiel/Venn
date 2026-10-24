import { DateTime } from 'luxon';
import { CircleHelp } from 'lucide-react';
import type { Candidate } from '@/features/scheduling/rank';
import { type DemoScenario, formatDemoTime } from '@/features/demo/scenario';
import { PersonAvatar } from './group-avatars';

export function DayCard({ scenario, timeZone, selected }: {
  scenario: DemoScenario; timeZone: string; selected?: Candidate;
}) {
  const startHour = Math.max(9, scenario.activity.startHour - 1);
  const endHour = Math.min(21, scenario.activity.endHour + 1);
  const start = scenario.day.plus({ hours: startHour }).toMillis();
  const end = scenario.day.plus({ hours: endHour }).toMillis();
  const position = (value: number) => Math.max(0, Math.min(100, (value - start) / (end - start) * 100));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const zoneName = DateTime.fromMillis(start, { zone: timeZone }).offsetNameShort;
  return (
    <div className="availability-card">
      <div className="availability-heading"><span>Room for each other</span><span className="timezone-label">{zoneName}</span></div>
      <div className="timeline-header"><span className="timeline-name-space" />
        <div className="timeline-hours">{hours.map(hour => <span key={hour} style={{ left: `${(hour - startHour) / (endHour - startHour) * 100}%` }}>{hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}<span className="hour-period">{hour === startHour || hour === endHour ? hour >= 12 ? 'p' : 'a' : ''}</span></span>)}</div>
      </div>
      <div className="timeline-rows">{scenario.people.map(person => {
        const member = scenario.members.find(member => member.memberId === person.id)!;
        return <div className="timeline-row" key={person.id}>
          <div className="timeline-person"><PersonAvatar person={person} small /><span>{person.name}</span></div>
          <div className={`timeline-track${member.state === 'unknown' ? ' timeline-track--unknown' : ''}`} aria-label={member.state === 'unknown' ? `${person.name}: calendar not connected; availability unknown` : `${person.name}: sample availability`}>
            {hours.map(hour => <span className="timeline-gridline" key={hour} style={{ left: `${(hour - startHour) / (endHour - startHour) * 100}%` }} />)}
            {member.state === 'unknown' ? <span className="unknown-track-label"><CircleHelp size={12} /> calendar not connected</span> : <>
              {member.busy.filter(busy => busy.end > start && busy.start < end).map((busy, index) => <span className="busy-buffer" key={`buffer-${index}`} style={{ left: `${position(busy.start - 15 * 60_000)}%`, width: `${position(busy.end + 15 * 60_000) - position(busy.start - 15 * 60_000)}%` }} />)}
              {member.busy.filter(busy => busy.end > start && busy.start < end).map((busy, index) => <span className="busy-block" key={index} style={{ left: `${position(busy.start)}%`, width: `${position(busy.end) - position(busy.start)}%` }} title={`Busy ${formatDemoTime(busy.start, timeZone)}–${formatDemoTime(busy.end, timeZone)}`} />)}
              {selected && member.state === 'known' && selected.freeIds.includes(person.id) && <span className="selected-window" style={{ left: `${position(selected.start)}%`, width: `${position(selected.end) - position(selected.start)}%` }} />}
            </>}
          </div>
        </div>;
      })}</div>
      <div className="timeline-legend"><span><i className="legend-dot legend-dot--overlap" />Selected time</span><span><i className="legend-dot legend-dot--busy" />Busy</span><span><i className="legend-dot legend-dot--buffer" />15 min breathing room</span></div>
    </div>
  );
}
