// Centralized PostHog product-event tracking. Use these typed helpers instead
// of calling posthog.capture() ad-hoc, so event names + properties stay
// consistent across the app (which keeps funnels/insights reliable).
//
// All calls are safe no-ops when PostHog isn't loaded (no key configured).
import posthog from "posthog-js";

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;
  posthog.capture(event, props);
}

export const analytics = {
  otCreated(props: {
    ot_id: string;
    workspace_id: string;
    tipo_trabajo: string;
    prioridad: string;
    recurrencia: string;
    asignados_count: number;
  }) {
    capture("ot_created", props);
  },

  otCompleted(props: {
    ot_id: string;
    workspace_id: string;
    tiempo_total_segundos: number;
  }) {
    capture("ot_completed", props);
  },

  subscriptionActivated(props: { plan_key: string; workspace_id?: string }) {
    capture("subscription_activated", props);
  },

  trialStarted() {
    capture("trial_started");
  },

  pdfExported(props: { ot_id?: string; kind: string }) {
    capture("pdf_exported", props);
  },
};
