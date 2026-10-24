import { z } from 'zod';
import { IANAZone } from 'luxon';

export const requestSchema = z.object({ groupId: z.string().min(1).max(100), requesterMemberId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(2000), timezone: z.string().refine(IANAZone.isValidZone) }).strict();
