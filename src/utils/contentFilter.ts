export type ContentValidation = { allowed: true } | { allowed: false; error: string };

const embeddedBlockedTerms = [
  'arrombado',
  'babaca',
  'buceta',
  'caralho',
  'fdp',
  'filhodaputa',
  'imbecil',
  'nazista',
  'otario',
  'racista',
  'retardado',
  'vagabundo',
];

const standaloneBlockedTerms = ['cu', 'merda', 'porra', 'puta', 'puto'];

function replaceLeetspeak(value: string): string {
  return value
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

function normalize(value: string): string {
  return replaceLeetspeak(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  );
}

function collapseRepeats(value: string): string {
  return value.replace(/([a-z])\1+/g, '$1');
}

function forms(value: string): { compact: string; tokens: string[] } {
  const normalized = normalize(value);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return {
    compact: collapseRepeats(compact),
    tokens: tokens.flatMap((token) => {
      const collapsed = collapseRepeats(token);
      const withoutTrailingNumbers = collapsed.replace(/\d+$/g, '');
      return withoutTrailingNumbers === collapsed
        ? [collapsed]
        : [collapsed, withoutTrailingNumbers];
    }),
  };
}

function hasSeparatedTerm(value: string): boolean {
  const normalized = normalize(value);
  return [...embeddedBlockedTerms, ...standaloneBlockedTerms].some((term) => {
    const pattern = term.split('').join('[^a-z0-9]+');
    return new RegExp(pattern).test(normalized);
  });
}

export function validatePublicIdentity(value: string, fieldLabel: string): ContentValidation {
  const candidate = forms(value);
  const hasEmbeddedTerm = embeddedBlockedTerms.some((term) =>
    candidate.compact.includes(collapseRepeats(term)),
  );
  const hasStandaloneTerm = standaloneBlockedTerms.some((term) =>
    candidate.tokens.includes(collapseRepeats(term)),
  );

  if (hasEmbeddedTerm || hasStandaloneTerm || hasSeparatedTerm(value)) {
    return { allowed: false, error: `${fieldLabel} não pode conter linguagem ofensiva.` };
  }
  return { allowed: true };
}
