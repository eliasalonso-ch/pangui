"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /ordenes/crear → open inline create panel on the ordenes page
export default function CrearRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/ordenes?nuevo=1"); }, []);
  return null;
}
