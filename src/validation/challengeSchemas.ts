import { z } from 'zod';

export const challengeIndexSchema = z.coerce.number().int().min(1).max(5).default(1);

export const challengeIdSchema = z.string().regex(/^[A-Za-z0-9]{20}$/);

export const challengeAnswerSchema = z
  .object({
    resposta: z.union([z.string().trim().min(1).max(100), z.number().finite()]),
    usouDica: z.boolean().optional().default(false),
  })
  .strict();
