// supabase/functions/escanear-orden/index.ts
// Parses a maintenance work order photo using Gemini Vision.

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are parsing a maintenance work order or service request document.

Extract fields and return ONLY a valid JSON object — no markdown, no explanation:

{
  "titulo": "concise job title max 80 chars",
  "titulo_conf": "high or low",
  "numero_meconecta": "the order/request reference number or null",
  "numero_meconecta_conf": "high or low",
  "ubicacion": "building name (Ubicación field) or null",
  "lugar": "specific area within building (Lugar field) or null",
  "ubicacion_conf": "high or low",
  "prioridad": "urgente, alta, media, or baja — map normal/blank to media",
  "descripcion": "full detail of work needed or null",
  "solicitante": "requester full name or null",
  "solicitante_conf": "high or low"
}

Use "high" confidence when the text is clearly visible and legible. Use "low" when guessed, partially visible, or unclear. If a value field is null, its confidence is "low".`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
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
    // Pick the last text part — thinking models prepend a reasoning part first
    const rawText: string = [...parts].reverse().find((p: { text?: string }) => p.text)?.text ?? "{}";

    const clean = rawText
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(clean);

    const VALID_PRIOS = new Set(["urgida", "urgente", "alta", "media", "baja"]);
    if (!VALID_PRIOS.has(parsed.prioridad)) parsed.prioridad = "media";

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("escanear-orden crash:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
