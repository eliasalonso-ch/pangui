"use client";
import { use } from "react";
import ProcedimientoBuilder from "../../ProcedimientoBuilder";

export default function EditarProcedimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProcedimientoBuilder editId={id} />;
}
