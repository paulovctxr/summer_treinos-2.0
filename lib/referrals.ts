export const REFERRAL_STORAGE_KEY = "summer-referral-code";

export function referralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(normalized) ? normalized : null;
}

export function referralCookieValue(code: string, secure: boolean) {
  const valid = referralCode(code);
  if (!valid) throw new TypeError("Código de indicação inválido.");
  return [
    `summer_referral=${encodeURIComponent(valid)}`,
    "Path=/",
    "Max-Age=2592000",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function referralInvitePath(code: string) {
  const valid = referralCode(code);
  if (!valid) throw new TypeError("Código de indicação inválido.");
  return `/convite/${encodeURIComponent(valid)}`;
}
