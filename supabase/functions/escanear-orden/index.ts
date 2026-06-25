// supabase/functions/escanear-orden/index.ts
//
// Parses a maintenance work order PDF (or image) by sending the raw text
// extracted client-side together with the workspace catalog (sociedades,
// ubicaciones, lugares, hitos, categorias, usuarios, activos). Gemini both
// extracts the OT fields AND fuzzy-matches each field to existing catalog
// rows, returning ranked candidates with confidence scores. The client then
// uses a 3-tier UI (high auto-fill, medium suggest, low manual) instead of
// hoping a regex catches every workspace's quirks.

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CatalogItem { id: string; name: string }
interface Catalog {
  sociedades:   CatalogItem[];
  ubicaciones:  CatalogItem[];
  lugares:      CatalogItem[];
  hitos:        CatalogItem[];
  categorias:   CatalogItem[];
  usuarios:     CatalogItem[];
  activos:      CatalogItem[];
  solicitantes: CatalogItem[];
}

function renderCatalog(c: Catalog): string {
  const section = (label: string, items: CatalogItem[]) => {
    if (!items?.length) return `${label}: (vacío)`;
    // Cap each section at 200 rows to keep token use bounded for big workspaces.
    const capped = items.slice(0, 200);
    const lines = capped.map((i) => `  - ${i.id} :: ${i.name}`).join("\n");
    const note = items.length > capped.length ? `\n  (… ${items.length - capped.length} más, no listadas)` : "";
    return `${label}:\n${lines}${note}`;
  };
  return [
    section("SOCIEDADES",   c.sociedades),
    section("UBICACIONES",  c.ubicaciones),
    section("LUGARES",      c.lugares),
    section("HITOS",        c.hitos),
    section("CATEGORIAS",   c.categorias),
    section("USUARIOS",     c.usuarios),
    section("ACTIVOS",      c.activos),
    section("SOLICITANTES", c.solicitantes),
  ].join("\n\n");
}

const SYSTEM_PROMPT = `Eres un asistente que analiza órdenes de trabajo / solicitudes de mantención en español.

Recibes:
1. El texto crudo extraído de un PDF (puede tener saltos de línea raros, tablas mal alineadas, etc).
2. El catálogo del workspace: listas de sociedades, ubicaciones, lugares específicos, hitos, categorías, usuarios y activos, cada uno con su id.

Tu trabajo es:
A. Extraer los campos del documento.
B. Para los campos que se relacionen con el catálogo (sociedad, ubicación, lugar, hito, categoría, asignados, activo, solicitante), proponer hasta 3 candidatos del catálogo ordenados por confianza.

SOLICITANTE (PERSONA DE CONTACTO):
- El solicitante es la "Persona de contacto" del documento. Usa su Nombre. El "Anexo" es su teléfono y el "Email" su correo.
- Haz fuzzy-match del nombre contra el catálogo SOLICITANTES: el documento suele traer el nombre abreviado (ej: "Cristian Quijada") y el catálogo el nombre completo (ej: "Cristian Gonzalo Quijada González"). Trátalos como la misma persona (confianza alta) cuando nombre y apellido coinciden, aunque falten segundos nombres/apellidos.

REGLAS DE MATCHING:
- La confianza va de 0.0 a 1.0.
- 1.0 = el texto extraído coincide casi literal con el nombre del catálogo.
- 0.9+ = clara coincidencia con pequeñas diferencias (acentos, abreviaciones obvias, mayúsculas).
- 0.6–0.9 = coincidencia probable pero ambigua (ej: "Sala 305" podría ser "Sala 305 Norte" o "Sala 305 Sur").
- <0.6 = especulativo, mejor no proponer.
- Si NO hay candidatos razonables (>0.5), devuelve "candidates": [].
- NO inventes ids. Solo usa ids que aparecen en el catálogo dado.
- Para "asignados", devuelve TODOS los nombres mencionados como ejecutores/asignados/técnicos, cada uno con sus candidatos.

Devuelve SOLO un JSON válido con esta forma exacta (sin markdown, sin explicación):

{
  "titulo":      "título conciso del trabajo, máx 80 chars o null",
  "n_ot":        "folio/número de referencia o null",
  "solicitante": { "extracted": "nombre de la persona de contacto tal cual aparece en el PDF o null", "candidates": [{ "id": "...", "name": "...", "confidence": 0.0 }] },
  "solicitante_telefono": "Anexo/teléfono de la persona de contacto o null",
  "solicitante_email": "Email de la persona de contacto o null",
  "descripcion": "detalle completo del trabajo o null",
  "prioridad":   "urgente | alta | media | baja | ninguna",
  "tipo_trabajo": "reactiva | preventiva | emergencia | levantamiento | ''",
  "fecha_inicio": "YYYY-MM-DD o null",
  "sociedad":   { "extracted": "texto crudo del PDF o null", "candidates": [{ "id": "...", "name": "...", "confidence": 0.0 }] },
  "ubicacion":  { "extracted": "...", "candidates": [...] },
  "lugar":      { "extracted": "...", "candidates": [...] },
  "hito":       { "extracted": "...", "candidates": [...] },
  "categoria":  { "extracted": "...", "candidates": [...] },
  "activo":     { "extracted": "...", "candidates": [...] },
  "asignados":  [ { "extracted": "nombre crudo", "candidates": [...] } ]
}

Si un campo no aparece en el documento, "extracted" debe ser null y "candidates" debe ser []. "asignados" puede ser [] si no hay personas mencionadas.`;

const VALID_PRIOS = new Set(["urgente", "alta", "media", "baja", "ninguna"]);
const VALID_TIPOS = new Set(["reactiva", "preventiva", "emergencia", "levantamiento", ""]);

interface FieldResult {
  extracted: string | null;
  candidates: { id: string; name: string; confidence: number }[];
}

function sanitizeFieldResult(raw: any, catalogIds: Set<string>): FieldResult {
  if (!raw || typeof raw !== "object") return { extracted: null, candidates: [] };
  const extracted = typeof raw.extracted === "string" && raw.extracted.trim() ? raw.extracted.trim() : null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
        .filter((c: any) => c && typeof c.id === "string" && catalogIds.has(c.id))
        .slice(0, 3)
        .map((c: any) => ({
          id: c.id,
          name: typeof c.name === "string" ? c.name : "",
          confidence: typeof c.confidence === "number" ? Math.max(0, Math.min(1, c.confidence)) : 0,
        }))
        .sort((a: any, b: any) => b.confidence - a.confidence)
    : [];
  return { extracted, candidates };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { pdfText, catalog } = body as { pdfText?: string; catalog?: Catalog };

    if (!pdfText || typeof pdfText !== "string") {
      return new Response(JSON.stringify({ error: "pdfText required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    if (!catalog) {
      return new Response(JSON.stringify({ error: "catalog required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Build a set of every legitimate id so we can drop any hallucinated ones.
    const catalogIds = new Set<string>();
    for (const list of [catalog.sociedades, catalog.ubicaciones, catalog.lugares, catalog.hitos, catalog.categorias, catalog.usuarios, catalog.activos, catalog.solicitantes]) {
      for (const item of list ?? []) catalogIds.add(item.id);
    }

    const userPrompt = `CATÁLOGO DEL WORKSPACE:\n\n${renderCatalog(catalog)}\n\n────────────\n\nTEXTO DEL PDF:\n\n${pdfText}`;

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT }, { text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini error:", res.status, errText);
      return new Response(JSON.stringify({ error: `Gemini ${res.status}`, detail: errText }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const apiData = await res.json();
    const parts = apiData.candidates?.[0]?.content?.parts ?? [];
    const rawText: string = [...parts].reverse().find((p: { text?: string }) => p.text)?.text ?? "{}";
    const clean = rawText
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error("JSON parse failed:", parseErr, "raw:", clean.slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Normalize + drop hallucinated ids.
    const result = {
      titulo:        typeof parsed.titulo === "string" ? parsed.titulo : null,
      n_ot:          typeof parsed.n_ot === "string" ? parsed.n_ot : null,
      // `solicitante` is now a catalog-matched field (extracted name + candidates).
      // Back-compat: tolerate an old-style plain string by wrapping it.
      solicitante:   typeof parsed.solicitante === "string"
        ? { extracted: parsed.solicitante.trim() || null, candidates: [] }
        : sanitizeFieldResult(parsed.solicitante, catalogIds),
      solicitante_telefono: typeof parsed.solicitante_telefono === "string" && parsed.solicitante_telefono.trim() ? parsed.solicitante_telefono.trim() : null,
      solicitante_email:    typeof parsed.solicitante_email === "string" && parsed.solicitante_email.trim() ? parsed.solicitante_email.trim() : null,
      descripcion:   typeof parsed.descripcion === "string" ? parsed.descripcion : null,
      prioridad:     VALID_PRIOS.has(parsed.prioridad) ? parsed.prioridad : "ninguna",
      tipo_trabajo:  VALID_TIPOS.has(parsed.tipo_trabajo) ? parsed.tipo_trabajo : "",
      fecha_inicio:  typeof parsed.fecha_inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha_inicio) ? parsed.fecha_inicio : null,
      sociedad:   sanitizeFieldResult(parsed.sociedad,  catalogIds),
      ubicacion:  sanitizeFieldResult(parsed.ubicacion, catalogIds),
      lugar:      sanitizeFieldResult(parsed.lugar,     catalogIds),
      hito:       sanitizeFieldResult(parsed.hito,      catalogIds),
      categoria:  sanitizeFieldResult(parsed.categoria, catalogIds),
      activo:     sanitizeFieldResult(parsed.activo,    catalogIds),
      asignados:  Array.isArray(parsed.asignados)
        ? parsed.asignados.map((a: any) => sanitizeFieldResult(a, catalogIds))
        : [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("escanear-orden crash:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
