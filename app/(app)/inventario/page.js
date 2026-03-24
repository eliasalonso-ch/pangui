"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function InventarioRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/partes"); }, []);
  return null;
}
