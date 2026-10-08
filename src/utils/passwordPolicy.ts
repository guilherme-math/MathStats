export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter pelo menos 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.';

export type PasswordRequirements = {
  minimumLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialCharacter: boolean;
};

export function getPasswordRequirements(password: unknown): PasswordRequirements {
  const value = typeof password === 'string' ? password : '';
  return {
    minimumLength: value.length >= 8 && value.length <= 128,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    specialCharacter: /[^A-Za-z0-9\s]/.test(value),
  };
}

export function isPasswordValid(password: unknown): password is string {
  return Object.values(getPasswordRequirements(password)).every(Boolean);
}