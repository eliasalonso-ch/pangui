"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { IconoToast } from "@/components/ui/sonner";
import { fetchInvitaciones, aceptarInvitacion, type InvitacionContratista } from "@/lib/envios-api";

/**
 * Aviso para el contratista: un cliente lo invitó a recibir OTs. Aparece a
 * quien entró con el correo invitado; aceptar exige ser owner/admin (lo valida
 * la RPC). Es un toast info sin vencimiento por invitación; si lo descarta,
 * vuelve en la próxima carga mientras la invitación siga pendiente.
 */
export default function InvitacionesContratista() {
  useEffect(() => {
    fetchInvitaciones().then(invitaciones => {
      for (const inv of invitaciones) {
        // El id evita duplicarlo si el efecto corre dos veces.
        toast.info(`${inv.cliente} quiere enviarte órdenes de trabajo por Pangui`, {
          id: `invitacion-${inv.id}`,
          description: "Verás solo las OTs que te envíe; tus datos siguen siendo tuyos.",
          duration: Infinity,
          className: "toast-vertical",
          icon: <IconoToast><Handshake size={16} /></IconoToast>,
          action: { label: "Aceptar", onClick: () => aceptar(inv) },
        });
      }
    }).catch(() => {});
  }, []);

  return null;
}

function aceptar(inv: InvitacionContratista) {
  toast.promise(aceptarInvitacion(inv.id), {
    loading: "Aceptando invitación…",
    success: `Listo: ${inv.cliente} ya puede enviarte OTs. Aparecerán en tu bandeja de Órdenes.`,
    error: (err: unknown) => (err instanceof Error ? err.message : "No se pudo aceptar la invitación."),
  });
}
