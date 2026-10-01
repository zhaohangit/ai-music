import { ValidationError } from '../validate.js';

const HTTP_HEADER_SAFE_KEY = /^[\x21-\x7E]{8,191}$/;

/** Match the ModelCross Work mutation-key contract exactly. */
export function assertModelCrossIdempotencyKey(value: string): void {
  if (typeof value !== 'string' || !HTTP_HEADER_SAFE_KEY.test(value)) {
    throw new ValidationError(
      'Idempotency-Key must be 8-191 visible ASCII characters without whitespace',
    );
  }
}
