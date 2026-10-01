import { ValidationError } from './errors.js';

/**
 * Reject fields outside the public MuseFlow contract instead of silently
 * dropping a misspelled Provider parameter.  Keeping this helper in its own
 * module avoids a catalog <-> validation circular import at runtime.
 */
export function assertAllowedFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
  context = 'request',
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).find((field) => !allowedSet.has(field));
  if (unknown) throw new ValidationError(`${context} field ${unknown} is not supported`);
}
