import type { DemoPerson } from '@/features/demo/scenario';

export function PersonAvatar({ person, muted = false, small = false }: {
  person: DemoPerson; muted?: boolean; small?: boolean;
}) {
  return <span className={`person-avatar person-avatar--${person.color}${muted ? ' person-avatar--muted' : ''}${small ? ' person-avatar--small' : ''}`} title={person.name} aria-label={person.name}>{person.initials}</span>;
}

export function GroupAvatars({ people, freeIds, small = false }: {
  people: DemoPerson[]; freeIds?: string[]; small?: boolean;
}) {
  return <span className="group-avatars" aria-label={people.map(person => person.name).join(', ')}>
    {people.map(person => <PersonAvatar key={person.id} person={person} muted={freeIds ? !freeIds.includes(person.id) : !person.connected} small={small} />)}
  </span>;
}
