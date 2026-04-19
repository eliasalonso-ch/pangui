import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseDescMeta,
  buildDescripcion,
  fetchOrdenes,
  fetchOrden,
  createOrden,
  updateOrdenEstado,
  updateOrdenPrioridad,
  deleteOrden,
  insertActividad,
  addComentario,
  iniciarOrden,
  pausarOrden,
  reanudarOrden,
  completarOrden,
} from "@/lib/ordenes-api";

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockSingle    = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect    = vi.fn();
const mockInsert    = vi.fn();
const mockUpdate    = vi.fn();
const mockDelete    = vi.fn();
const mockEq        = vi.fn();
const mockIs        = vi.fn();
const mockOrder     = vi.fn();
const mockLimit     = vi.fn();

function chain(final: () => any) {
  const obj: any = {};
  obj.select      = (..._: any[]) => { mockSelect(..._);  return obj; };
  obj.insert      = (..._: any[]) => { mockInsert(..._);  return obj; };
  obj.update      = (..._: any[]) => { mockUpdate(..._);  return obj; };
  obj.delete      = (..._: any[]) => { mockDelete(..._);  return obj; };
  obj.eq          = (..._: any[]) => { mockEq(..._);      return obj; };
  obj.is          = (..._: any[]) => { mockIs(..._);      return obj; };
  obj.order       = (..._: any[]) => { mockOrder(..._);   return obj; };
  obj.limit       = (..._: any[]) => { mockLimit(..._);   return obj; };
  obj.single      = ()           => { mockSingle();       return final(); };
  obj.maybeSingle = ()           => { mockMaybeSingle();  return final(); };
  // allow await on the chain itself (for delete, update without .single())
  obj.then        = (res: any)   => Promise.resolve(final()).then(res);
  return obj;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── parseDescMeta ─────────────────────────────────────────────────────────────

describe("parseDescMeta", () => {
  it("returns all nulls for empty string", () => {
    const r = parseDescMeta("");
    expect(r.nOT).toBeNull();
    expect(r.solicitante).toBeNull();
    expect(r.descripcion).toBeNull();
  });

  it("returns all nulls for null input", () => {
    const r = parseDescMeta(null);
    expect(r).toEqual({ nOT: null, solicitante: null, hito: null, ubicacionTexto: null, lugar: null, descripcion: null });
  });

  it("treats plain text with no meta as descripcion", () => {
    const r = parseDescMeta("Cambiar filtro de aceite");
    expect(r.descripcion).toBe("Cambiar filtro de aceite");
    expect(r.nOT).toBeNull();
  });

  it("parses N° OT", () => {
    const r = parseDescMeta("N° OT: SF123");
    expect(r.nOT).toBe("SF123");
    expect(r.descripcion).toBeNull();
  });

  it("parses all meta fields from a single header line", () => {
    const raw = "N° OT: SF123 | Solicitante: Juan | Hito: H1 | Ubicación: Bodega | Lugar: Piso 2";
    const r = parseDescMeta(raw);
    expect(r.nOT).toBe("SF123");
    expect(r.solicitante).toBe("Juan");
    expect(r.hito).toBe("H1");
    expect(r.ubicacionTexto).toBe("Bodega");
    expect(r.lugar).toBe("Piso 2");
  });

  it("separates header from body on double newline", () => {
    const raw = "N° OT: SF999\n\nRevisar la bomba principal";
    const r = parseDescMeta(raw);
    expect(r.nOT).toBe("SF999");
    expect(r.descripcion).toBe("Revisar la bomba principal");
  });

  it("preserves multi-paragraph body", () => {
    const raw = "N° OT: X1\n\nPárrafo 1\n\nPárrafo 2";
    const r = parseDescMeta(raw);
    expect(r.descripcion).toBe("Párrafo 1\n\nPárrafo 2");
  });
});

// ── buildDescripcion ──────────────────────────────────────────────────────────

describe("buildDescripcion", () => {
  it("returns just the body when all meta is empty", () => {
    const r = buildDescripcion({ nOT: "", solicitante: "", hito: "", body: "Hacer algo" });
    expect(r).toBe("Hacer algo");
  });

  it("returns just the header when body is empty", () => {
    const r = buildDescripcion({ nOT: "OT-1", solicitante: "", hito: "", body: "" });
    expect(r).toBe("N° OT: OT-1");
  });

  it("combines header and body with double newline", () => {
    const r = buildDescripcion({ nOT: "OT-1", solicitante: "Ana", hito: "", body: "Descripción" });
    expect(r).toBe("N° OT: OT-1 | Solicitante: Ana\n\nDescripción");
  });

  it("trims whitespace from each field", () => {
    const r = buildDescripcion({ nOT: "  OT-2  ", solicitante: "", hito: "", body: "  cuerpo  " });
    expect(r).toBe("N° OT: OT-2\n\ncuerpo");
  });

  it("round-trips through parseDescMeta", () => {
    const original = { nOT: "SF001", solicitante: "Pedro", hito: "H3", body: "Revisión anual" };
    const built = buildDescripcion(original);
    const parsed = parseDescMeta(built);
    expect(parsed.nOT).toBe("SF001");
    expect(parsed.solicitante).toBe("Pedro");
    expect(parsed.hito).toBe("H3");
    expect(parsed.descripcion).toBe("Revisión anual");
  });
});

// ── fetchOrdenes ──────────────────────────────────────────────────────────────

describe("fetchOrdenes", () => {
  it("returns data from the query", async () => {
    const fakeData = [{ id: "1", titulo: "OT1", estado: "pendiente" }];
    mockFrom.mockReturnValue(chain(() => ({ data: fakeData, error: null })));

    const result = await fetchOrdenes("ws-1");
    expect(mockFrom).toHaveBeenCalledWith("ordenes_trabajo");
    expect(result).toEqual(fakeData);
  });

  it("throws on Supabase error", async () => {
    mockFrom.mockReturnValue(chain(() => ({ data: null, error: new Error("DB error") })));
    await expect(fetchOrdenes("ws-1")).rejects.toThrow("DB error");
  });

  it("returns empty array when data is null", async () => {
    mockFrom.mockReturnValue(chain(() => ({ data: null, error: null })));
    const result = await fetchOrdenes("ws-1");
    expect(result).toEqual([]);
  });
});

// ── fetchOrden ────────────────────────────────────────────────────────────────

describe("fetchOrden", () => {
  it("fetches a single order by id", async () => {
    const fakeOrder = { id: "abc", titulo: "Test OT", estado: "en_curso" };
    mockFrom.mockReturnValue(chain(() => ({ data: fakeOrder, error: null })));

    const result = await fetchOrden("abc");
    expect(mockEq).toHaveBeenCalledWith("id", "abc");
    expect(result).toEqual(fakeOrder);
  });

  it("throws when order not found", async () => {
    mockFrom.mockReturnValue(chain(() => ({ data: null, error: new Error("Not found") })));
    await expect(fetchOrden("missing")).rejects.toThrow("Not found");
  });
});

// ── updateOrdenEstado ─────────────────────────────────────────────────────────

describe("updateOrdenEstado", () => {
  it("updates estado and inserts actividad", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await updateOrdenEstado("ot-1", "completado", "user-1");
    expect(mockFrom).toHaveBeenCalledWith("ordenes_trabajo");
    expect(mockUpdate).toHaveBeenCalledWith({ estado: "completado" });
  });

  it("throws on update error", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: new Error("Update failed") })));
    await expect(updateOrdenEstado("ot-1", "completado", "user-1")).rejects.toThrow("Update failed");
  });
});

// ── updateOrdenPrioridad ──────────────────────────────────────────────────────

describe("updateOrdenPrioridad", () => {
  it("updates prioridad and inserts actividad", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await updateOrdenPrioridad("ot-1", "urgente", "user-1");
    expect(mockUpdate).toHaveBeenCalledWith({ prioridad: "urgente" });
  });
});

// ── deleteOrden ───────────────────────────────────────────────────────────────

describe("deleteOrden", () => {
  it("deletes an order", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await expect(deleteOrden("ot-1")).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("ordenes_trabajo");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "ot-1");
  });

  it("throws on delete error", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: new Error("Delete failed") })));
    await expect(deleteOrden("ot-1")).rejects.toThrow("Delete failed");
  });
});

// ── insertActividad ───────────────────────────────────────────────────────────

describe("insertActividad", () => {
  it("inserts an activity record", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await insertActividad("ot-1", "user-1", "creado", "Título OT");
    expect(mockFrom).toHaveBeenCalledWith("actividad_ot");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      orden_id:   "ot-1",
      usuario_id: "user-1",
      tipo:       "creado",
      comentario: "Título OT",
    }));
  });

  it("uses null when comentario is omitted", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await insertActividad("ot-2", "user-1", "completado");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ comentario: null }));
  });

  it("throws on insert error", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: new Error("Insert failed") })));
    await expect(insertActividad("ot-1", "user-1", "creado")).rejects.toThrow("Insert failed");
  });
});

// ── addComentario ─────────────────────────────────────────────────────────────

describe("addComentario", () => {
  it("delegates to insertActividad with tipo=comentario", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await addComentario("ot-1", "user-1", "Todo OK");
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "comentario",
      comentario: "Todo OK",
    }));
  });
});

// ── Timer operations ──────────────────────────────────────────────────────────

describe("iniciarOrden", () => {
  it("sets en_ejecucion=true and estado=en_curso", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await iniciarOrden("ot-1", "user-1");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      en_ejecucion: true,
      estado: "en_curso",
    }));
  });
});

describe("pausarOrden", () => {
  it("sets en_ejecucion=false and estado=en_espera", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await pausarOrden("ot-1", "user-1", "Esperando pieza", 300);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      en_ejecucion: false,
      tiempo_total_segundos: 300,
      estado: "en_espera",
    }));
  });
});

describe("reanudarOrden", () => {
  it("sets en_ejecucion=true and clears pausado_at", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await reanudarOrden("ot-1", "user-1");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      en_ejecucion: true,
      pausado_at: null,
      estado: "en_curso",
    }));
  });
});

describe("completarOrden", () => {
  it("sets estado=completado and stores elapsed time", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await completarOrden("ot-1", "user-1", "Trabajo terminado", 3600);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estado: "completado",
      en_ejecucion: false,
      tiempo_total_segundos: 3600,
    }));
  });
});
