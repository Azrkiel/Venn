import { z } from 'zod';
import { IANAZone } from 'luxon';

// Solo requests omit both ids; a group request needs the group and its requester together.
export const requestSchema = z.object({ groupId: z.string().min(1).max(100).optional(), requesterMemberId: z.string().min(1).max(100).optional(),
  text: z.string().trim().min(1).max(2000), timezone: z.string().refine(IANAZone.isValidZone) }).strict()
  .refine(value => (value.groupId === undefined) === (value.requesterMemberId === undefined), { message: 'Send groupId and requesterMemberId together, or neither.' });
