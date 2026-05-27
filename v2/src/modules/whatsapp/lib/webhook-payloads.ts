import { z } from 'zod';

export const BaseDecisionSchema = z.object({
  type: z.literal('poll_vote'),
  outboxId: z.string().uuid(),
  recipientPhone: z.string(),
  tenantId: z.string().uuid(),
  timestamp: z.number(),
});

export type BaseDecisionPayload = z.infer<typeof BaseDecisionSchema>;
