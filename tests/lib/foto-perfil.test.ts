import { describe, expect, it } from "vitest";
import { rutaDeFoto } from "@/lib/foto-perfil";

describe("rutaDeFoto", () => {
  it("saca la ruta del bucket de la URL pública", () => {
    expect(rutaDeFoto("https://x.supabase.co/storage/v1/object/public/avatares/u1/170.jpg")).toBe("u1/170.jpg");
    expect(rutaDeFoto("https://x.supabase.co/storage/v1/object/public/avatares/u1/170.jpg?t=1")).toBe("u1/170.jpg");
  });

  it("no borra nada que no sea del bucket", () => {
    expect(rutaDeFoto(null)).toBeNull();
    expect(rutaDeFoto("https://x.supabase.co/storage/v1/object/public/workspace-logos/w/logo.png")).toBeNull();
  });
});
