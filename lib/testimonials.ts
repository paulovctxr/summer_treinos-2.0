export const TESTIMONIAL_QUOTE_MIN = 20;
export const TESTIMONIAL_QUOTE_MAX = 400;

export type TestimonialStatus = "draft" | "published" | "revoked";
export type TestimonialConsentMethod = "formulario" | "whatsapp" | "presencial" | "email" | "outro";

export type PublicTestimonial = {
  displayName: string;
  displayLabel: string | null;
  quote: string;
  publishedAt: string;
};

export type AdminTestimonial = PublicTestimonial & {
  id: number;
  status: TestimonialStatus;
  consentedAt: string;
  consentMethod: TestimonialConsentMethod;
  createdAt: string;
};

const statuses = new Set<TestimonialStatus>(["draft", "published", "revoked"]);
const consentMethods = new Set<TestimonialConsentMethod>([
  "formulario",
  "whatsapp",
  "presencial",
  "email",
  "outro",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : null;
}

function optionalLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return boundedString(value, 2, 60);
}

function isoDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function publicTestimonial(value: unknown): PublicTestimonial | null {
  if (!isRecord(value)) return null;
  const displayName = boundedString(value.display_name, 1, 40);
  const displayLabel = optionalLabel(value.display_label);
  const hasDisplayLabel = value.display_label !== null
    && value.display_label !== undefined
    && value.display_label !== "";
  const quote = boundedString(value.quote, TESTIMONIAL_QUOTE_MIN, TESTIMONIAL_QUOTE_MAX);
  const publishedAt = isoDate(value.published_at);
  if (!displayName || hasDisplayLabel && displayLabel === null || !quote || !publishedAt) return null;
  return { displayName, displayLabel, quote, publishedAt };
}

/**
 * Parses the deliberately small public projection and drops every unknown
 * field. Account ids, consent records and internal notes can never flow into
 * the public component through this return value.
 */
export function readPublishedTestimonials(payload: unknown): PublicTestimonial[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .slice(0, 12)
    .map(publicTestimonial)
    .filter((item): item is PublicTestimonial => item !== null);
}

export function readAdminTestimonials(payload: unknown): AdminTestimonial[] {
  if (!isRecord(payload) || !Array.isArray(payload.testimonials)) return [];
  const parsed: AdminTestimonial[] = [];
  for (const value of payload.testimonials) {
    if (!isRecord(value)) continue;
    const visible = publicTestimonial({
      ...value,
      // Drafts and revoked quotes do not have a publication date. The admin
      // model keeps the same shape while using an empty string for that case.
      published_at: value.published_at ?? value.created_at,
    });
    const id = value.id;
    const status = value.status;
    const consentedAt = isoDate(value.consented_at);
    const consentMethod = value.consent_method;
    const createdAt = isoDate(value.created_at);
    if (
      !visible
      || typeof id !== "number"
      || !Number.isSafeInteger(id)
      || id <= 0
      || typeof status !== "string"
      || !statuses.has(status as TestimonialStatus)
      || typeof consentMethod !== "string"
      || !consentMethods.has(consentMethod as TestimonialConsentMethod)
      || !consentedAt
      || !createdAt
    ) continue;
    parsed.push({
      ...visible,
      publishedAt: isoDate(value.published_at) ?? "",
      id,
      status: status as TestimonialStatus,
      consentedAt,
      consentMethod: consentMethod as TestimonialConsentMethod,
      createdAt,
    });
  }
  return parsed;
}

export const consentMethodLabels: Record<TestimonialConsentMethod, string> = {
  formulario: "Formulário assinado",
  whatsapp: "WhatsApp",
  presencial: "Autorização presencial",
  email: "E-mail",
  outro: "Outro registro",
};

export const testimonialStatusLabels: Record<TestimonialStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  revoked: "Revogado",
};
