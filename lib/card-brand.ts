/**
 * Maps a card-brand label (as returned by Flow.cl in flow_customers.card_brand
 * — e.g. "Visa", "Mastercard", "American Express") to a local logo path under
 * /public/brands/.
 *
 * We only show what Flow tells us — Pangui never reads card numbers, so we do
 * NOT do BIN detection here.
 */
export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "diners"
  | "discover"
  | "redcompra"
  | "generic";

const BRAND_MAP: Record<string, CardBrand> = {
  visa:                "visa",
  mastercard:          "mastercard",
  master:              "mastercard",
  "mc":                "mastercard",
  amex:                "amex",
  "american express":  "amex",
  "american-express":  "amex",
  diners:              "diners",
  "diners club":       "diners",
  "diners-club":       "diners",
  discover:            "discover",
  redcompra:           "redcompra",
  "red compra":        "redcompra",
};

/** Resolves Flow's `creditCardType` string to one of our supported logo keys. */
export function resolveCardBrand(raw?: string | null): CardBrand {
  if (!raw) return "generic";
  const key = raw.trim().toLowerCase();
  return BRAND_MAP[key] ?? "generic";
}

/** Public path to the brand SVG (served from /public/brands). */
export function cardBrandLogoSrc(raw?: string | null): string {
  return `/brands/${resolveCardBrand(raw)}.svg`;
}

/** Human-readable label for display. Falls back to the raw value if unknown. */
export function cardBrandLabel(raw?: string | null): string {
  if (!raw) return "Tarjeta";
  const key = raw.trim().toLowerCase();
  const labels: Partial<Record<CardBrand, string>> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    diners: "Diners Club",
    discover: "Discover",
    redcompra: "Redcompra",
  };
  return labels[BRAND_MAP[key] ?? "generic"] ?? raw;
}
