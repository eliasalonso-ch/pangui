"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function InicioRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/datos"); }, [router]);
  return null;
}
