import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { ReferralCapture } from "@/components/referral-capture";
import { referralCode, referralInvitePath } from "@/lib/referrals";
import { InviteActions } from "./invite-actions";
import styles from "./page.module.css";

type PublicReferral = { valid: boolean; code?: string; label?: string };

export const metadata: Metadata = {
  title: "Convite Summer Fit — 7 dias de Summer PRO",
  description: "Digitalize sua ficha e experimente o Summer PRO gratuitamente por sete dias.",
  robots: { index: false, follow: false },
};

export default async function ReferralInvite({ params }: { params: Promise<{ code: string }> }) {
  const requested = referralCode((await params).code);
  let invitation: PublicReferral | null = null;
  if (requested) {
    try {
      const supabase = await createClient();
      const result = await supabase.rpc("summer_public_referral", { p_code: requested });
      if (!result.error && result.data) invitation = result.data as PublicReferral;
    } catch { invitation = null; }
  }
  if (!requested || invitation?.valid === false) return <main className={styles.page}><section className={styles.invalid}>
    <img src="/summer-fit-brand.jpeg" alt="Summer Fit" />
    <h1>Este convite não está disponível</h1>
    <p>Confira o endereço do QR Code com a recepção da academia ou abra o Summer Fit normalmente.</p>
    <Link href="/" className="primary-button">Abrir Summer Fit</Link>
  </section></main>;

  // During a staged rollout, a syntactically valid code still renders if the
  // public validation RPC has not reached this deployment yet. Attachment is
  // always validated by the database before attribution.
  const code = invitation?.code || requested;
  const label = invitation?.label || "Equipe Summer Fit";
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = configured || `${protocol}://${host}`;
  const inviteUrl = new URL(referralInvitePath(code), origin).toString();
  const qr = await QRCode.toDataURL(inviteUrl, { errorCorrectionLevel: "M", margin: 2, width: 560, color: { dark: "#111111", light: "#ffffff" } });

  return <main className={styles.page}>
    <ReferralCapture code={code} />
    <article className={styles.card}>
      <div className={styles.top}>
        <section className={styles.copy}>
          <img className={styles.brand} src="/summer-fit-brand.jpeg" alt="Summer Fit" />
          <p className={styles.eyebrow}>CONVITE DE {label.toLocaleUpperCase("pt-BR")}</p>
          <h1>Seu treino no celular. Sete dias de PRO grátis.</h1>
          <p className={styles.lead}>Digitalize sua ficha, registre cargas e experimente gráficos, recordes, alimentação por foto e um cardápio de sete dias.</p>
          <div className={styles.benefits}>
            <span>Ficha da academia por foto</span><span>Evolução de cargas e recordes</span>
            <span>Cardápio personalizado</span><span>Sem cartão e sem cobrança automática</span>
          </div>
          <p className={styles.fine}>Uma avaliação gratuita por conta. O acesso PRO termina automaticamente após sete dias; seus treinos permanecem salvos.</p>
        </section>
        <aside className={styles.qrPanel}>
          <img src={qr} alt={`QR Code para ${inviteUrl}`} width={560} height={560} />
          <strong>Aponte a câmera e comece</strong>
          <small>{inviteUrl}</small>
        </aside>
      </div>
      <InviteActions code={code} />
    </article>
  </main>;
}
