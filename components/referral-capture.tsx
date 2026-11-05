"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { REFERRAL_STORAGE_KEY, referralCode, referralCookieValue } from "@/lib/referrals";

export function ReferralCapture({ code }: { code: string }) {
  useEffect(() => {
    const valid = referralCode(code);
    if (!valid) return;
    try {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, valid);
      document.cookie = referralCookieValue(valid, window.location.protocol === "https:");
    } catch { /* The signup metadata remains an optional fallback. */ }

    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user || cancelled) return;
        const result = await supabase.rpc("summer_attach_referral", { p_code: valid });
        if (!result.error && !cancelled) window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
      } catch { /* The code stays stored and can be attached after signup. */ }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return null;
}
