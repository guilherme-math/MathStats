export const USER_ROLES = ['aluno'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = 'aluno';

export function normalizeUserRole(value: unknown): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : DEFAULT_USER_ROLE;
}