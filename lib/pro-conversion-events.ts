export const PRO_CONVERSION_EVENT_NAMES = [
  "offer_viewed",
  "trial_started",
  "pro_feature_opened",
  "checkout_opened",
  "mercado_pago_opened",
  "pix_copied",
  "whatsapp_clicked",
  "subscription_requested",
  "subscription_approved",
] as const;

export type ProConversionEventName = (typeof PRO_CONVERSION_EVENT_NAMES)[number];
export type ProConversionSource =
  | "home" | "progress" | "nutrition" | "paywall" | "plans"
  | "checkout" | "mercado_pago" | "whatsapp" | "trial"
  | "referral" | "system" | "unknown";

const sources = new Set<ProConversionSource>([
  "home", "progress", "nutrition", "paywall", "plans", "checkout",
  "mercado_pago", "whatsapp", "trial", "referral", "system", "unknown",
]);

export function safeReferralCode(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("pt-BR") || "";
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(normalized) ? normalized : null;
}

export function safeProConversionSource(value: string | null | undefined): ProConversionSource {
  return sources.has(value as ProConversionSource) ? value as ProConversionSource : "unknown";
}

export function trackProConversionEvent(
  event: ProConversionEventName,
  source: ProConversionSource = "unknown",
  referralCode?: string | null,
) {
  if (!PRO_CONVERSION_EVENT_NAMES.includes(event)) return;
  if (typeof window === "undefined") return;
  const normalizedSource = safeProConversionSource(source);
  const referral = safeReferralCode(referralCode);
  const key = `summer-pro-event:${event}:${normalizedSource}:${referral || ""}`;
  const dedupeInTab = event === "offer_viewed";
  try {
    if (dedupeInTab && window.sessionStorage.getItem(key)) return;
    if (dedupeInTab) window.sessionStorage.setItem(key, "pending");
  } catch {
    // Some privacy modes block sessionStorage. Server-side deduplication still
    // prevents rapid duplicate events.
  }

  // Event delivery never delays navigation, trial activation or payment.
  void import("./supabase/client").then(async ({ createClient }) => {
    const { error } = await createClient().rpc("summer_log_pro_conversion_event", {
      p_event_name: event,
      p_source: normalizedSource,
      p_referral_code: referral,
    });
    if (error && dedupeInTab) window.sessionStorage.removeItem(key);
    else if (dedupeInTab) window.sessionStorage.setItem(key, "sent");
  }).catch(() => {
    try {
      if (dedupeInTab) window.sessionStorage.removeItem(key);
    } catch {
      // Analytics failures are intentionally silent.
    }
  });
}
