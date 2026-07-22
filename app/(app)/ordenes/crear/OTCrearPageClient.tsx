"use client";

import { useRouter } from "next/navigation";
import OTCrearPanel from "../OTCrearPanel";
import type {
  Activo,
  CategoriaOT,
  LugarEspecifico,
  Sociedad,
  Ubicacion,
  Usuario,
} from "@/types/ordenes";

interface Props {
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  lugares: LugarEspecifico[];
  sociedades: Sociedad[];
  activos: Activo[];
  categorias: CategoriaOT[];
  myId: string;
  wsId: string;
}

export default function OTCrearPageClient(props: Props) {
  const router = useRouter();

  return (
    <div style={{ height: "calc(100dvh - var(--global-topbar-height, 0px))", minHeight: 0 }}>
      <OTCrearPanel
        {...props}
        onClose={() => router.push("/ordenes")}
        onCreated={orden => router.replace(`/ordenes?id=${encodeURIComponent(orden.id)}`)}
      />
    </div>
  );
}
