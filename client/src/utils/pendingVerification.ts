// The password typed at registration (or at a login that turned out to need
// verification), handed to the verify screen IN MEMORY so it isn't asked for
// twice. Not router state or sessionStorage: those would keep the plain-text
// password in the browser's history/storage. A reload loses it, and the verify
// screen then simply asks for it.
let pending: { email: string; password: string } | null = null;

export const stashVerificationPassword = (email: string, password: string) => {
  pending = { email: email.trim().toLowerCase(), password };
};

/** Returns (and forgets) the stashed password if it belongs to `email`. */
export const takeVerificationPassword = (email: string): string => {
  const match = pending && pending.email === email.trim().toLowerCase() ? pending.password : '';
  pending = null;
  return match;
};
