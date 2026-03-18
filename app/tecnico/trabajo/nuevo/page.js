"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Technicians no longer create orders — only the boss (jefe) can.
export default function TecnicoNuevoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/tecnico"); }, [router]);
  return null;
}
