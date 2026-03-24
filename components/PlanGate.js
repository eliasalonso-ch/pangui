"use client";
import PaywallBanner from "./PaywallBanner";
import { tieneAcceso } from "@/lib/planes";

/**
 * Renders children if the plan has access to the feature,
 * otherwise renders a PaywallBanner.
 *
 * Props:
 *  - plan:        string   "basic" | "pro" | "enterprise" | null
 *  - planStatus:  string   "trial" | "active" | "payment_failed" | null
 *  - feature:     string   key from FEATURES_PRO (e.g. "preventivos")
 *  - title:       string   displayed in the paywall
 *  - description: string
 *  - bullets:     string[]
 *  - icon:        Lucide component
 *  - children:    ReactNode
 */
export default function PlanGate({ plan, planStatus, feature, title, description, bullets, icon, children }) {
  if (tieneAcceso(plan, planStatus, feature)) {
    return children;
  }

  return (
    <PaywallBanner
      feature={title}
      description={description}
      bullets={bullets}
      icon={icon}
    />
  );
}
