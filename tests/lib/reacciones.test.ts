import { describe, expect, it } from "vitest";
import { agruparReacciones, miReaccion, siguienteReaccion, TIPOS_REACCIONABLES } from "../../lib/reacciones";
import { tonoDeActividad } from "../../lib/actividad-estado";

describe("reacciones", () => {
  it("elegir la misma la quita, otra la reemplaza", () => {
    expect(siguienteReaccion("❤️", "❤️")).toBeNull();
    expect(siguienteReaccion("❤️", "👍")).toBe("👍");
    expect(siguienteReaccion(null, "🎉")).toBe("🎉");
  });

  it("agrupa por emoji en orden de aparición y marca la mía", () => {
    const grupos = agruparReacciones(
      [{ emoji: "👍", usuario_id: "a" }, { emoji: "❤️", usuario_id: "b" }, { emoji: "👍", usuario_id: "me" }],
      "me",
    );
    expect(grupos).toEqual([
      { emoji: "👍", usuarios: ["a", "me"], mine: true },
      { emoji: "❤️", usuarios: ["b"], mine: false },
    ]);
    expect(miReaccion([{ emoji: "🔥", usuario_id: "me" }], "me")).toBe("🔥");
    expect(miReaccion(undefined, "me")).toBeNull();
  });

  it("solo comentarios y estados admiten reacciones", () => {
    expect(TIPOS_REACCIONABLES.has("pausado")).toBe(true);
    expect(TIPOS_REACCIONABLES.has("asignado")).toBe(false);
  });
});

describe("tonoDeActividad", () => {
  it("eventos fijos", () => {
    expect(tonoDeActividad("pausado", "A espera de materiales")).toBe("wait");
    expect(tonoDeActividad("completado", null)).toBe("done");
    expect(tonoDeActividad("iniciado", "Inició la OT")).toBe("progress");
  });

  it("estado_cambiado lee el estado como etiqueta o clave", () => {
    expect(tonoDeActividad("estado_cambiado", "En espera")).toBe("wait");
    expect(tonoDeActividad("estado_cambiado", "en_curso")).toBe("progress");
    expect(tonoDeActividad("estado_cambiado", "En revisión")).toBe("review");
    expect(tonoDeActividad("estado_cambiado", "Algo raro")).toBeNull();
  });

  it("lo que no es estado no lleva color", () => {
    expect(tonoDeActividad("comentario", "hola")).toBeNull();
    expect(tonoDeActividad("asignado", "uuid")).toBeNull();
  });
});
