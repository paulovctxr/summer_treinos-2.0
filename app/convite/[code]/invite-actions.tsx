"use client";

import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";

export function InviteActions({ code }: { code: string }) {
  return <div className="invite-actions">
    <Link className="primary-button" href={`/?ref=${encodeURIComponent(code)}&cadastro=1`}>
      COMEÇAR NO SUMMER FIT <ArrowRight size={18} aria-hidden="true" />
    </Link>
    <button type="button" className="secondary-button invite-print" onClick={() => window.print()}>
      <Printer size={17} aria-hidden="true" /> Imprimir este convite
    </button>
  </div>;
}
