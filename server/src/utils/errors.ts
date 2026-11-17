// Bad input found deep inside a handler (a bulk row, a backup entry). Thrown so
// the handler can answer 400 with the message, instead of the generic 500 its
// catch block gives unexpected errors.
export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
