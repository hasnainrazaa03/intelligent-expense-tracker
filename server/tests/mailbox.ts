// What the (mocked) mailer would have sent, so tests can read verification,
// sign-in and reset codes. Filled by the mock in setup.ts.
export interface SentMail { kind: 'verification' | 'two-factor' | 'password-reset' | 'generic'; to: string; code?: string; subject?: string; text?: string; headers?: Record<string, string> }

export const mailbox: SentMail[] = [];

/** The latest code sent to `to` (of the given kind). */
export const lastCode = (to: string, kind: SentMail['kind']): string | undefined =>
  [...mailbox].reverse().find((m) => m.to === to && m.kind === kind)?.code;
