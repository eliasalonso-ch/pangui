import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseDescMeta,
  buildDescripcion,
  fetchOrdenes,
  fetchOrden,
  createOrden,
  createSubOrden,
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

const notificationMocks = vi.hoisted(() => ({
  created: vi.fn(),
  stateChanged: vi.fn(),
}));

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
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase-auth-retry", () => ({
  withSupabaseAuthRetry: (operation: () => PromiseLike<unknown>) => operation(),
}));

vi.mock("@/lib/notificar", () => ({
  notifyOTCreada: notificationMocks.created,
  notifyOTEstadoCambiado: notificationMocks.stateChanged,
}));

vi.mock("@/lib/cuotas-client", () => ({
  ensureOtCategoria: vi.fn().mockResolvedValue(undefined),
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

describe("createOrden characterization contract", () => {
  it("creates the web OT and audit rows as independent writes", async () => {
    const created = {
      id: "ot-1",
      workspace_id: "ws-1",
      creado_por: "user-1",
      titulo: "Revisar tablero",
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "workspaces") {
        return chain(() => ({
          data: {
            requiere_materiales_global: true,
            requiere_hoja_global: false,
            requiere_fotos_global: false,
            fotos_obligatorias_todas: true,
          },
          error: null,
        }));
      }
      if (table === "ordenes_trabajo") return chain(() => ({ data: created, error: null }));
      return chain(() => ({ error: null }));
    });

    await createOrden({
      workspaceId: "ws-1",
      creadoPor: "user-1",
      titulo: "Revisar tablero",
      descripcion: "Inspección preventiva",
      prioridad: "alta",
      tipo_trabajo: "reactiva",
      asignados_ids: ["tech-1"],
    });

    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual([
      "workspaces",
      "ordenes_trabajo",
      "actividad_ot",
      "actividad_ot",
    ]);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: "ws-1",
      estado: "pendiente",
      requiere_materiales: true,
      requiere_hoja: false,
      requiere_fotos: true,
      asignados_ids: ["tech-1"],
    }));
    expect(mockFrom).not.toHaveBeenCalledWith("hojas_inventario");
    expect(notificationMocks.created).toHaveBeenCalledWith(expect.objectContaining({
      ordenId: "ot-1",
      workspaceId: "ws-1",
    }));
  });
});

describe("createSubOrden characterization contract", () => {
  it("characterizes the narrower web sub-OT inheritance", async () => {
    const parent = {
      id: "parent-1",
      workspace_id: "ws-1",
      creado_por: "user-1",
      descripcion: "No se copia actualmente",
      tipo_trabajo: "preventiva",
      prioridad: "media",
      asignados_ids: ["tech-1"],
      ubicacion_id: "ubi-1",
      lugar_id: "lugar-1",
      sociedad_id: "soc-1",
      fecha_inicio: "2026-07-25",
      fecha_termino: "2026-07-26",
      requiere_materiales: true,
      requiere_hoja: true,
      requiere_fotos: true,
      categoria_id: "cat-1",
      activo_id: "activo-1",
      n_serie: "SERIE-1",
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "ordenes_trabajo") {
        return chain(() => ({ data: { ...parent, id: "child-1", parent_id: "parent-1" }, error: null }));
      }
      if (table === "ot_procedimientos") return chain(() => ({ data: [], error: null }));
      return chain(() => ({ error: null }));
    });

    await createSubOrden("parent-1", "Hija", parent as any);

    const childInsert = mockInsert.mock.calls[0][0];
    expect(childInsert).toEqual(expect.objectContaining({
      parent_id: "parent-1",
      descripcion: "",
      ubicacion_id: "ubi-1",
      lugar_id: "lugar-1",
      sociedad_id: "soc-1",
      requiere_hoja: true,
    }));
    expect(childInsert).not.toHaveProperty("categoria_id");
    expect(childInsert).not.toHaveProperty("activo_id");
    expect(childInsert).not.toHaveProperty("n_serie");
    expect(mockFrom).not.toHaveBeenCalledWith("hojas_inventario");
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
  it("soft-deletes an order", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await expect(deleteOrden("ot-1")).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("ordenes_trabajo");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      deleted_at: expect.any(String),
      deleted_by: null,
    }));
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
  it("characterizes the current web terminal payload", async () => {
    mockFrom.mockReturnValue(chain(() => ({ error: null })));
    await completarOrden("ot-1", "user-1", "Trabajo terminado", 3600);
    const terminalPatch = mockUpdate.mock.calls[0][0];
    expect(terminalPatch).toEqual(expect.objectContaining({
      estado: "completado",
      en_ejecucion: false,
      tiempo_total_segundos: 3600,
      fecha_termino: expect.any(String),
    }));
    expect(terminalPatch).not.toHaveProperty("pausado_at");
    expect(terminalPatch).not.toHaveProperty("completado_por");
  });
});
