// Foto de perfil: se reduce en el navegador y se sube a `avatares/{userId}/`.
//
// 256×256 JPEG (~20-30 KB) en vez del original de varios MB: se muestra en
// círculos de 18-34 px y cada dispositivo la baja una sola vez. La ruta lleva
// un timestamp, así que una foto nueva es una URL nueva y la vieja puede
// quedarse cacheada un año sin riesgo.

import { createClient } from "./supabase";

const BUCKET = "avatares";
const LADO = 256;

/** Recorte cuadrado centrado, 256×256, JPEG. */
async function reducirFoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const lado = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LADO;
  const ctx = canvas.getContext("2d")!;
  // Un PNG transparente quedaría con fondo negro al pasar a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  bmp.close();
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("No se pudo procesar la imagen."))), "image/jpeg", 0.85),
  );
}

/** Ruta dentro del bucket a partir de la URL pública, o null si no es nuestra. */
export function rutaDeFoto(url: string | null | undefined): string | null {
  const marca = `/${BUCKET}/`;
  const i = url ? url.indexOf(marca) : -1;
  return i < 0 ? null : url!.slice(i + marca.length).split("?")[0];
}

/**
 * Sube `file` como nueva foto (o la quita si es null) y devuelve la URL final.
 * La foto anterior se borra después de guardar, para no dejarla pública.
 */
export async function guardarFotoPerfil(userId: string, file: File | null, urlAnterior: string | null): Promise<string | null> {
  const sb = createClient();
  let url: string | null = null;
  let path: string | null = null;

  if (file) {
    let blob: Blob;
    try {
      blob = await reducirFoto(file);
    } catch {
      throw new Error("No se pudo leer la imagen. Prueba con un JPG o PNG.");
    }
    path = `${userId}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw error;
    url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await sb.from("usuarios").update({ avatar_url: url }).eq("id", userId);
  if (error) {
    if (path) void sb.storage.from(BUCKET).remove([path]);
    throw error;
  }

  const vieja = rutaDeFoto(urlAnterior);
  if (vieja) void sb.storage.from(BUCKET).remove([vieja]);
  return url;
}
