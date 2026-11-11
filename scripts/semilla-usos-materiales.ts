/**
 * Semilla de usos (una sola vez): el texto libre histórico de cada maestro,
 * pasado por el diccionario de cobros, para que el picker de materiales ya
 * sepa qué usa cada uno el primer día. Uso:
 *   npx tsx scripts/semilla-usos-materiales.ts --directo             (muestra el top, no escribe)
 *   npx tsx scripts/semilla-usos-materiales.ts --directo --escribir  (lee y escribe con la service role de .env.local)
 *   npx tsx scripts/semilla-usos-materiales.ts filas.json catalogo.json > semilla.sql
 * filas.json = [{ created_by, columnas, celdas, updated_at }] de las hojas de
 * materiales usados de Electrilam; catalogo.json = catalogo_materiales.
 */
import { readFileSync } from "node:fs";
import { codigosDeTexto } from "../lib/cobros-diccionario";
import { normMaterial, type Material } from "../lib/materiales-busqueda";

export type FilaHist = { created_by: string; columnas: { id: string; label: string }[]; celdas: Record<string, string>; updated_at: string };
export type UsoSemilla = { usuario_id: string; codigo: string; veces: number; ultimo_uso: string };

export function semilla(filas: FilaHist[], catalogo: Material[]): UsoSemilla[] {
  const ok = new Map(catalogo.map((m) => [m.codigo.toLowerCase(), m.codigo]));
  const porDesc = new Map(catalogo.map((m) => [normMaterial(m.descripcion), m.codigo]));
  const acc = new Map<string, UsoSemilla>();
  for (const f of filas) {
    const col = f.columnas.find((c) => ["material", "item", "descripcion"].includes(normMaterial(c.label)))?.id ?? f.columnas[0]?.id;
    const t = normMaterial(String(f.celdas?.[col ?? ""] ?? ""));
    if (!t) continue;
    const codigos = porDesc.has(t) ? [porDesc.get(t)!] : codigosDeTexto(t, (c) => ok.get(c.toLowerCase())) ?? [];
    for (const codigo of codigos) {
      const k = `${f.created_by}|${codigo}`;
      const a = acc.get(k) ?? { usuario_id: f.created_by, codigo, veces: 0, ultimo_uso: f.updated_at };
      a.veces++;
      if (f.updated_at > a.ultimo_uso) a.ultimo_uso = f.updated_at;
      acc.set(k, a);
    }
  }
  return [...acc.values()];
}

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

/** Lee hojas y catálogo con la service role de .env.local, y escribe la semilla. */
async function directo(escribir: boolean) {
  const { createClient } = await import("@supabase/supabase-js");
  process.loadEnvFile(".env.local");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const todo = async <T>(q: (d: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    const out: T[] = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await q(d);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  };
  const cat = await todo<Material>((d) => sb.from("catalogo_materiales").select("codigo, descripcion, unidad, clasificacion").eq("workspace_id", ELECTRILAM).order("codigo").range(d, d + 999));
  const hojas = await todo<{ id: string; created_by: string | null; columnas: FilaHist["columnas"] }>((d) =>
    sb.from("hojas_inventario").select("id, created_by, columnas").eq("workspace_id", ELECTRILAM).in("tipo", ["materiales_usados", "cobro"]).order("id").range(d, d + 999));
  const porHoja = new Map(hojas.filter((h) => h.created_by).map((h) => [h.id, h]));
  const filas = await todo<{ hoja_id: string; celdas: Record<string, string>; updated_at: string }>((d) =>
    sb.from("hojas_inventario_filas").select("hoja_id, celdas, updated_at").eq("workspace_id", ELECTRILAM).order("id").range(d, d + 999));
  const hist: FilaHist[] = filas.flatMap((f) => {
    const h = porHoja.get(f.hoja_id);
    return h ? [{ created_by: h.created_by!, columnas: h.columnas ?? [], celdas: f.celdas ?? {}, updated_at: f.updated_at }] : [];
  });
  const usos = semilla(hist, cat);
  const top = [...usos].sort((a, b) => b.veces - a.veces).slice(0, 15);
  console.log(`${cat.length} códigos · ${hist.length} filas · ${usos.length} pares maestro/código · ${usos.reduce((s, u) => s + u.veces, 0)} usos`);
  console.table(top);
  if (!escribir) return console.log("(prueba: agrega --escribir para guardar)");
  const { error } = await sb.from("material_usos_semilla").upsert(usos.map((u) => ({ workspace_id: ELECTRILAM, ...u })), { onConflict: "workspace_id,usuario_id,codigo" });
  if (error) throw error;
  console.log("semilla guardada");
}

if (process.argv[1]?.endsWith("semilla-usos-materiales.ts")) {
  const args = process.argv.slice(2);
  if (args[0] === "--directo") {
    directo(args.includes("--escribir")).catch((e) => { console.error(e); process.exit(1); });
  } else {
    const [filasPath, catPath, ws = ELECTRILAM] = args;
    const filas = JSON.parse(readFileSync(filasPath, "utf8")) as FilaHist[];
    const cat = JSON.parse(readFileSync(catPath, "utf8")) as Material[];
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const vals = semilla(filas.filter((f) => f.created_by), cat)
      .map((r) => `(${q(ws)}, ${q(r.usuario_id)}, ${q(r.codigo)}, ${r.veces}, ${q(r.ultimo_uso)})`);
    console.log(`insert into material_usos_semilla (workspace_id, usuario_id, codigo, veces, ultimo_uso) values\n${vals.join(",\n")}\non conflict do nothing;`);
  }
}
