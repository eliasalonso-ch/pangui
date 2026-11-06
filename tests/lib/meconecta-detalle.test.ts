// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseDetalle, decodificar } from "@/supabase/functions/_shared/meconecta-scrape";
import { matchIto, matchCategoria, prioridadDe, sumarDias, descripcionDe } from "@/supabase/functions/_shared/meconecta-reglas";

// Markup copiado de una página "Ver solicitud" real (nov 2026), con datos
// inventados. Ojo con lo que el parser debe resistir: el "Nombre" de Persona de
// Contacto aparece antes que el "Nombre" de los modales; "Nombre Resolutor" va
// como texto suelto (sin DestacaTexto); la ubicación trae espacios de cola.
const HTML = `
<form class="form-horizontal" role="form">
  <div class="form-group">
    <label class="control-label col-sm-3">Nombres y Apellidos:</label>
    <div class="col-sm-9"><div class="DestacaTexto">Ana María Pérez Soto</div></div>
  </div>
  <div class="form-group">
    <label class="control-label col-sm-3">Sociedad:</label>
    <div class="col-sm-9"><div class="DestacaTexto">Universidad de Concepción</div></div>
  </div>
  <div class="form-group">
    <label class="control-label col-sm-3">Teléfono:</label>
    <div class="col-sm-9"><div class="DestacaTexto">+56 9 11112222</div></div>
  </div>
</form>
<form class="form-horizontal" role="form">
  <div class="form-group">
    <label class="control-label col-sm-3">N°: </label>
    <div class="col-sm-9"><div class="DestacaTexto">SF920260000001</div></div>
  </div>
</form>
<div><span class="tituloFormulario">Título</span><table><tbody><tr><td><label class="control-label">Título Solicitud</label><br><div class="DestacaTexto">Enchufe quemado</div></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Prioridad</span><table><tbody><tr><td><label class="control-label">Prioridad</label><br><div class="DestacaTexto">normal</div></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Ubicación</span><table><tbody><tr><td><label class="control-label">Ubicación</label><br><div class="DestacaTexto">CENTRO EULA - EDIFICIO 1    </div></td></tr><tr><td><label class="control-label">Lugar</label><br><div class="DestacaTexto">Primer Piso Sala Estudio</div></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Persona de Contacto</span><table><tbody><tr><td><label class="control-label">Nombre</label><br><div class="DestacaTexto">Pedro Contacto</div></td></tr><tr><td><label class="control-label">Anexo</label><br><div class="DestacaTexto">4007</div></td></tr><tr><td><label class="control-label">E-mail</label><br><div class="DestacaTexto">pedro@udec.cl</div></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Documentos</span><table><tbody><tr><td><label class="control-label">Archivo 1</label><br><a href="https://meconecta.udec.cl/files/SF920260000001_1.jpeg" class="btn btn-primary" target="_blank">Descargar Archivo</a></td></tr><tr><td><label class="control-label">Archivo 2</label><br><a href="https://meconecta.udec.cl/files/SF920260000001_2.pdf" class="btn btn-primary" target="_blank">Descargar Archivo</a></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Detalle Solicitud</span><table><tbody><tr><td><label class="control-label">Detalle Solicitud</label><br><div class="DestacaTexto">El enchufe hizo corte &amp; se ve quemado.</div></td></tr></tbody></table></div>
<div><table><tbody><tr><td><label class="control-label">Tipo de Mantención</label><br><div class="DestacaTexto">Electrica</div></td></tr></tbody></table></div>
<div><span class="tituloFormulario">Validación</span><table><tbody><tr><td><label class="control-label">Area de Responsabilidad</label><br>Instalaciones Eléctricas</td></tr><tr><td><label class="control-label">Nombre Resolutor</label><br>Cristian Gonzalo Quijada González</td></tr><tr><td><label class="control-label">N° Orden CO</label><br></td></tr></tbody></table></div>
<div class="modal"><label class="control-label">Nombre</label><input class="form-control" name="nombre_sup" value="Otro Nombre"></div>
`;

describe("parseDetalle", () => {
  it("lee cada campo por su etiqueta", () => {
    expect(parseDetalle(HTML)).toEqual({
      folio: "SF920260000001",
      titulo: "Enchufe quemado",
      prioridad: "normal",
      ubicacion: "CENTRO EULA - EDIFICIO 1",
      lugar: "Primer Piso Sala Estudio",
      contacto: "Pedro Contacto",
      telefono: "4007",
      email: "pedro@udec.cl",
      detalle: "El enchufe hizo corte & se ve quemado.",
      tipoMantencion: "Electrica",
      sociedad: "Universidad de Concepción",
      resolutor: "Cristian Gonzalo Quijada González",
      archivos: [
        "https://meconecta.udec.cl/files/SF920260000001_1.jpeg",
        "https://meconecta.udec.cl/files/SF920260000001_2.pdf",
      ],
    });
  });

  it("sin Persona de Contacto usa los datos del solicitante", () => {
    const sinContacto = HTML.replace(/<span class="tituloFormulario">Persona de Contacto[\s\S]*?<\/tbody>/, "");
    const d = parseDetalle(sinContacto)!;
    expect(d.contacto).toBe("Ana María Pérez Soto");
    expect(d.telefono).toBe("+56 9 11112222");
  });

  it("devuelve null si la página no es un detalle (login, error)", () => {
    expect(parseDetalle("<html><form><input name='password'></form></html>")).toBeNull();
  });
});

describe("decodificar", () => {
  it("lee UTF-8 y cae a windows-1252 si no es UTF-8 válido", () => {
    expect(decodificar(new TextEncoder().encode("Mantención"))).toBe("Mantención");
    expect(decodificar(new Uint8Array([0x4d, 0x61, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x69, 0xf3, 0x6e]))).toBe("Mantención");
  });
});

describe("matchIto", () => {
  // Los ITO como están en Pangui (hitos de Electrilam), typo incluido.
  const HITOS = ["Cristian Quijada", "Enzo Cifuente", "Samuel Artiaga", "Javier Araneda", "Ricardo Tello"];

  it("calza el nombre completo del portal con el corto de Pangui", () => {
    expect(matchIto("Cristian Gonzalo Quijada González", HITOS)).toBe("Cristian Quijada");
    expect(matchIto("Enzo Andrés Cifuentes Castro", HITOS)).toBe("Enzo Cifuente");
    expect(matchIto("CRISTIÁN QUIJADA", HITOS)).toBe("Cristian Quijada");
  });

  it("no inventa: desconocido, vacío o ambiguo => null", () => {
    expect(matchIto("Paula Quijada Rojas", HITOS)).toBeNull();
    expect(matchIto("", HITOS)).toBeNull();
    expect(matchIto("Cristian Quijada", ["Cristian Quijada", "Cristian Q"])).toBeNull();
  });
});

describe("reglas de la OT", () => {
  it("categoría ignora tilde y género", () => {
    const cats = [{ id: "e", nombre: "Eléctrico" }, { id: "m", nombre: "Mecánico" }];
    expect(matchCategoria("Electrica", cats)).toBe("e");
    expect(matchCategoria("Mecanica", cats)).toBe("m");
    expect(matchCategoria("Gasfitería", cats)).toBeNull();
  });

  it("prioridad: normal y desconocidas => media", () => {
    expect(prioridadDe("normal")).toBe("media");
    expect(prioridadDe("Urgente")).toBe("urgente");
    expect(prioridadDe("emergencia")).toBe("urgente");
    expect(prioridadDe("Alta")).toBe("alta");
    expect(prioridadDe("cualquier cosa")).toBe("media");
  });

  it("plazo de 7 días cruza meses", () => {
    expect(sumarDias("2026-11-28", 7)).toBe("2026-12-05");
  });

  it("descripción con el mismo encabezado que la web", () => {
    const d = parseDetalle(HTML)!;
    expect(descripcionDe(d, "Cristian Quijada")).toBe(
      "N° OT: SF920260000001 | Solicitante: Pedro Contacto | Hito: Cristian Quijada\n\nEl enchufe hizo corte & se ve quemado.",
    );
    expect(descripcionDe(d, null)).toMatch(/^N° OT: SF920260000001 \| Solicitante: Pedro Contacto\n\n/);
  });
});
