import { z } from 'zod';
import type { RequestHandler } from 'express';

const username = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9._-]+$/);
const password = z.string().min(1).max(128);
const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export const signupSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60),
    username,
    email: z.email().max(254),
    password,
    lgpdAccepted: z.literal(true),
  })
  .strict();

export const loginSchema = z
  .object({
    username: z.string().trim().max(254).optional(),
    email: z.string().trim().max(254).optional(),
    password,
  })
  .strict()
  .refine((data) => Boolean(data.username || data.email));

export const mfaSchema = z
  .object({
    token: code,
    method: z.enum(['app', 'email']).optional(),
    rememberDevice: z.boolean().optional(),
  })
  .strict();

export const googleSchema = z
  .object({
    credential: z.string().min(1).max(8192),
    mode: z.enum(['login', 'register']),
    displayName: z.string().max(60).optional(),
    username: z.string().max(24).optional(),
    lgpdAccepted: z.boolean().optional(),
  })
  .strict();

export const recoveryStartSchema = z.object({ username }).strict();
export const recoveryVerifySchema = z.object({ token: code }).strict();
export const recoveryResetSchema = z.object({ password }).strict();
export const passwordChangeSchema = z
  .object({
    password,
    currentPassword: z.string().max(128).optional(),
  })
  .strict();

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      return res.status(400).json({ error: 'Confira os campos enviados e tente novamente.' });
    req.body = result.data;
    next();
  };
}
