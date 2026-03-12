/**
 * Extract the expiry timestamp (in ms) from a JWT token.
 * Uses atob for browser compatibility — no Node crypto needed.
 * Returns null if the token is malformed or has no `exp` claim.
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
