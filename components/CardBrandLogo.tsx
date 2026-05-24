/**
 * Inline SVG brand logos for credit cards. Colors are locked to the brand's
 * official palette regardless of theme (Visa is always blue, Mastercard always
 * red+orange, etc.) — matches how Stripe / Apple Pay render them on either
 * light or dark cards.
 */
import { resolveCardBrand } from "@/lib/card-brand";

interface Props {
  brand?: string | null;
  /** Height in px. Width auto-scales by aspect ratio. */
  height?: number;
}

// Brand palette (locked, never theme-adapted)
const VISA_BLUE      = "#1A1F71";
const AMEX_BLUE      = "#2671B9";
const DINERS_BLUE    = "#0079BE";
const DISCOVER_ORANGE = "#FF6000";
const DISCOVER_INK    = "#231F20";
const MC_RED        = "#EB001B";
const MC_ORANGE     = "#F79E1B";
const MC_OVERLAP    = "#FF5F00";
const REDCOMPRA_RED = "#E10E2C";

export function CardBrandLogo({ brand, height = 32 }: Props) {
  const key = resolveCardBrand(brand);
  switch (key) {
    case "visa":
      return (
        <svg viewBox="0 0 64 22" height={height} width={(64 / 22) * height} aria-label="Visa">
          <text
            x="32" y="18" textAnchor="middle"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="900" fontSize="20" fontStyle="italic"
            letterSpacing="0.5" fill={VISA_BLUE}
          >VISA</text>
        </svg>
      );
    case "mastercard":
      return (
        <svg viewBox="0 0 64 40" height={height} width={(64 / 40) * height} aria-label="Mastercard">
          <circle cx="26" cy="20" r="11" fill={MC_RED} />
          <circle cx="38" cy="20" r="11" fill={MC_ORANGE} />
          <path d="M32 12.5a11 11 0 0 0 0 15 11 11 0 0 0 0-15z" fill={MC_OVERLAP} />
        </svg>
      );
    case "amex":
      return (
        <svg viewBox="0 0 64 40" height={height} width={(64 / 40) * height} aria-label="American Express">
          <rect width="64" height="40" rx="4" fill={AMEX_BLUE} />
          <text x="32" y="18" textAnchor="middle"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="900" fontSize="9" fill="#FFFFFF" letterSpacing="0.4">AMERICAN</text>
          <text x="32" y="30" textAnchor="middle"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="900" fontSize="9" fill="#FFFFFF" letterSpacing="0.4">EXPRESS</text>
        </svg>
      );
    case "diners":
      return (
        <svg viewBox="0 0 64 40" height={height} width={(64 / 40) * height} aria-label="Diners Club">
          <circle cx="32" cy="20" r="14" fill={DINERS_BLUE} />
          <path d="M27 9.5v21a10.5 10.5 0 0 0 0-21zM37 9.5a10.5 10.5 0 0 1 0 21v-21z" fill="#FFFFFF" />
        </svg>
      );
    case "discover":
      return (
        <svg viewBox="0 0 64 40" height={height} width={(64 / 40) * height} aria-label="Discover">
          <text x="32" y="22" textAnchor="middle"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="900" fontSize="13" fill={DISCOVER_INK} letterSpacing="0.3">DISCOVER</text>
          <circle cx="56" cy="18" r="4" fill={DISCOVER_ORANGE} />
        </svg>
      );
    case "redcompra":
      return (
        <svg viewBox="0 0 64 22" height={height} width={(64 / 22) * height} aria-label="Redcompra">
          <text x="32" y="17" textAnchor="middle"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="900" fontSize="13" fill={REDCOMPRA_RED} letterSpacing="0.5">REDCOMPRA</text>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 40" height={height} width={(64 / 40) * height} aria-label="Tarjeta">
          <rect x="0.5" y="0.5" width="63" height="39" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.32" />
          <rect x="6" y="10" width="14" height="9" rx="2" fill="currentColor" fillOpacity="0.4" />
          <rect x="6" y="24" width="36" height="3" rx="1" fill="currentColor" fillOpacity="0.28" />
          <rect x="6" y="30" width="20" height="3" rx="1" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );
  }
}
