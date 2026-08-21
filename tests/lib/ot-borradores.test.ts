import { describe, it, expect } from "vitest";
import { borradorTieneContenido, type BorradorPayload } from "@/lib/ot-borradores-api";

// Mirrors BLANK in OTCrearPanel: what a freshly-opened form looks like.
const BLANK_LIKE: BorradorPayload = {
  titulo: "", n_ot: "", solicitante: "", solicitante_telefono: "",
  solicitante_email: "", hito: "", presupuesto: "", descripcion: "",
  ubicacion_id: "", lugar_id: "", sociedad_id: "", activo_id: "",
  asignados_ids: [], fecha_termino: "", fecha_inicio: "",
  recurrencia: "ninguna", recurrencia_config: null,
  tipo_trabajo: "reactiva", prioridad: "ninguna", categoria_id: "", links: [],
};

describe("borradorTieneContenido", () => {
  it("does not save an untouched form", () => {
    // tipo_trabajo defaults to "reactiva" here (not ""), so without the
    // special case every opened form would persist a junk draft.
    expect(borradorTieneContenido(BLANK_LIKE)).toBe(false);
  });

  it("saves once a título is typed", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, titulo: "Test" })).toBe(true);
  });

  it("ignores whitespace-only input", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, titulo: "   " })).toBe(false);
  });

  it("saves when only a non-default prioridad is set", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, prioridad: "urgente" })).toBe(true);
  });

  it("saves when a tipo_trabajo other than the default is chosen", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, tipo_trabajo: "preventiva" })).toBe(true);
  });

  it("saves when an asignado is added", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, asignados_ids: ["u1"] })).toBe(true);
  });

  it("saves solicitante contact details", () => {
    expect(borradorTieneContenido({ ...BLANK_LIKE, solicitante: "Ana" })).toBe(true);
  });
});
