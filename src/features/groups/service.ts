import { getDb } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { createSecret, digestSecret } from '@/features/identity/secrets';
import type { RequestContext } from '@/features/requests/prepare';

export async function listGroups(userId: string) {
  const groups = await getDb().group.findMany({ where: { OR: [{ ownerId: userId }, { memberships: { some: { userId } } }] },
    include: { memberships: { include: { user: { select: { calendarGrant: { select: { needsReconnect: true } } } } } }, invitedPeople: true }, orderBy: { createdAt: 'asc' } });
  return groups.map(group => ({ id: group.id, name: group.name, isOwner: group.ownerId === userId,
    members: group.memberships.map(member => ({ id: member.id, displayName: member.displayName,
      isYou: member.userId === userId, connected: Boolean(member.user.calendarGrant && !member.user.calendarGrant.needsReconnect) })),
    unknownPeople: group.invitedPeople.map(person => ({ id: person.id, displayName: person.label })) }));
}

export async function createGroup(userId: string, name: string) {
  const user = await getDb().user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, timezone: true } });
  return getDb().group.create({ data: { name, ownerId: userId,
    memberships: { create: { userId, displayName: user.name || 'You', timezone: user.timezone } } }, select: { id: true, name: true } });
}

export async function requireGroupOwner(userId: string, groupId: string): Promise<void> {
  if (!await getDb().group.findFirst({ where: { id: groupId, ownerId: userId }, select: { id: true } })) {
    throw new HttpError(403, 'FORBIDDEN', 'Only this group’s organizer can do that.');
  }
}

export async function createInvite(userId: string, groupId: string) {
  await requireGroupOwner(userId, groupId);
  const token = createSecret();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await getDb().invite.create({ data: { groupId, tokenDigest: digestSecret(token), expiresAt } });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function redeemInvite(userId: string, token: string) {
  return getDb().$transaction(async db => {
    const invite = await db.invite.findUnique({ where: { tokenDigest: digestSecret(token) }, include: { group: true } });
    if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) throw new HttpError(410, 'INVITE_EXPIRED', 'This invite has expired. Ask the organizer for another.');
    const existing = await db.membership.findUnique({ where: { groupId_userId: { groupId: invite.groupId, userId } } });
    if (existing) return { groupId: invite.groupId, groupName: invite.group.name };
    if (await db.membership.count({ where: { groupId: invite.groupId } }) >= 10) throw new HttpError(409, 'GROUP_FULL', 'This pilot group is full.');
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.membership.create({ data: { groupId: invite.groupId, userId, displayName: user.name || 'Friend', timezone: user.timezone } });
    return { groupId: invite.groupId, groupName: invite.group.name };
  }, { isolationLevel: 'Serializable' });
}

export async function leaveOrDeleteGroup(userId: string, groupId: string, deleteGroup: boolean) {
  const group = await getDb().group.findUnique({ where: { id: groupId } });
  if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', 'That group no longer exists.');
  if (deleteGroup) { await requireGroupOwner(userId, groupId); await getDb().group.delete({ where: { id: groupId } }); return; }
  if (group.ownerId === userId) throw new HttpError(409, 'OWNER_CANNOT_LEAVE', 'Delete the group explicitly instead of leaving it without an organizer.');
  await getDb().$transaction(async db => {
    const left = await db.membership.deleteMany({ where: { groupId, userId } });
    // Only a real member leaving changes the roster; anyone else must not invalidate the group's requests.
    if (left.count === 0) throw new HttpError(404, 'GROUP_NOT_FOUND', 'That group no longer exists.');
    await db.schedulingRequest.updateMany({ where: { groupId, state: { in: ['ready', 'selected'] } }, data: { state: 'retry_required' } });
  });
}

export async function requestContext(userId: string, groupId: string): Promise<RequestContext> {
  await requireGroupOwner(userId, groupId);
  const group = await getDb().group.findUniqueOrThrow({ where: { id: groupId }, include: { memberships: true, invitedPeople: true } });
  return { id: group.id, name: group.name, ownerId: group.ownerId,
    members: [...group.memberships.map(member => ({ id: member.id, userId: member.userId, displayName: member.displayName })),
      ...group.invitedPeople.map(person => ({ id: person.id, userId: null, displayName: person.label }))] };
}
