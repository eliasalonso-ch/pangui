# Materiales desde catálogo en las hojas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En Electrilam, la columna Material de las hojas de usados y solicitados se llena desde el catálogo (picker con orden personal), con "no listado" como salida, una bandeja web de pendientes, una pregunta al cerrar con solo solicitados y un export que usa el código directo.

**Architecture:** Una migración agrega alias, semilla de usos y tres RPC. Un archivo puro compartido (`lib/materiales-busqueda.ts`, copiado igual en web y mobile) hace la detección de columnas, la búsqueda y el orden. Mobile baja catálogo, alias y usos una vez y busca en el teléfono. La web reutiliza la misma función en la grilla y en la bandeja.

**Tech Stack:** Supabase (Postgres + RLS + RPC SQL), Next.js + TanStack Query (web), Expo SDK 57 + expo-router formSheet + TanStack Query (mobile), vitest en los dos repos.

**Spec:** `docs/superpowers/specs/2026-11-10-materiales-catalogo-picker-design.md` (repo `pangui`).

## Global Constraints

- Solo Electrilam: `ELECTRILAM_WORKSPACE_ID = "f1b64714-6de2-4d49-b6e4-5959553e94d7"` (web `lib/itos-gate`, mobile `constants/index.ts`). Los otros workspaces no cambian.
- Los maestros nunca crean códigos. Insert, update y delete en `catalogo_materiales` y `material_alias` son solo de owner/admin (`my_rol() in ('owner','admin')`).
- Precios nunca en Pangui.
- `lib/materiales-busqueda.ts` y `lib/cobros-diccionario.ts` son **idénticos byte a byte** en `C:\dev\pangui\lib\` y `C:\dev\pangui-native-sdk57\lib\`. Se editan en la web y se copian.
- Migraciones: un archivo en `pangui/supabase/migrations/`, aplicado con MCP `apply_migration` (project `yqwsryjbmlvcghnwnzik`), **nunca** `supabase db push`. Si MCP lo rechaza, se le pasa el SQL al usuario.
- Comentarios en español, como el resto del código.
- Mobile: rama base `fix/fotos-perdidas` (fuente del OTA de prod). **No publicar OTA**: lo hace el usuario.
- Web antes de push: `npx tsc --noEmit` + tests puntuales, no la suite completa.
- Una fila es **pendiente** cuando su hoja tiene columna con label "Código", Material no está vacío y Código está vacío. No se guarda en ningún lado.
- Detección de columnas **por label** (normalizado, sin tildes): material = `material|item|ítem|descripcion`, código = `codigo`. Las hojas creadas en la web tienen ids aleatorios, así que no se usan ids fijos (esto corrige el spec, que decía ids fijos).

## Ramas

- Web: `git -C C:\dev\pangui switch -c feat/materiales-picker main`. Hoy la web está en `feat/filtro-impresion` con cambios sin commitear: **preguntar al usuario antes de cambiar de rama**.
- Mobile: `git -C C:\dev\pangui-native-sdk57 switch -c feat/materiales-picker fix/fotos-perdidas`. Hay un `app/(stack)/nueva-orden.tsx` modificado: **preguntar antes**.

---

### Task 1: Migración — alias, semilla, permisos y RPCs

**Files:**
- Create: `C:\dev\pangui\supabase\migrations\20261110120000_materiales_picker.sql`

**Interfaces:**
- Produces:
  - `material_alias(workspace_id uuid, texto_norm text, codigo text)`, único `(workspace_id, texto_norm)`.
  - `material_usos_semilla(workspace_id uuid, usuario_id uuid, codigo text, veces int, ultimo_uso timestamptz)`.
  - RPC `material_usos()` → `table(codigo text, mios int, equipo int, ultimo_mio timestamptz)`, con `codigo` en minúsculas.
  - RPC `materiales_pendientes()` → `table(fila_id uuid, hoja_id uuid, orden_id uuid, numero int, autor text, fecha timestamptz, texto text, cantidad text)`.
  - RPC `resolver_material_pendiente(p_fila_id uuid, p_codigo text)` → void.

- [ ] **Step 1: Escribir la migración**

```sql
-- Picker de materiales (Electrilam): alias aprendidos, semilla de usos y las
-- RPC que alimentan el orden del picker y la bandeja de pendientes.
-- Spec: docs/superpowers/specs/2026-11-10-materiales-catalogo-picker-design.md

-- 1) Alias: lo que escribió un maestro → código. Lo escribe Claudio al resolver.
CREATE TABLE IF NOT EXISTS material_alias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  texto_norm   text NOT NULL,
  codigo       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, texto_norm)
);
ALTER TABLE material_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_alias_select ON material_alias FOR SELECT
  USING (workspace_id = my_workspace_id());
CREATE POLICY material_alias_write ON material_alias FOR ALL
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'))
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));

-- 2) Semilla: usos históricos (texto libre pasado por el diccionario). Se llena
-- una vez (Task 7) y no se vuelve a escribir desde la app.
CREATE TABLE IF NOT EXISTS material_usos_semilla (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL,
  codigo       text NOT NULL,
  veces        int  NOT NULL,
  ultimo_uso   timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, usuario_id, codigo)
);
ALTER TABLE material_usos_semilla ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_usos_semilla_select ON material_usos_semilla FOR SELECT
  USING (workspace_id = my_workspace_id());

-- 3) El catálogo solo lo tocan owner/admin: los maestros eligen, no crean.
DROP POLICY IF EXISTS catalogo_materiales_insert ON catalogo_materiales;
DROP POLICY IF EXISTS catalogo_materiales_update ON catalogo_materiales;
DROP POLICY IF EXISTS catalogo_materiales_delete ON catalogo_materiales;
CREATE POLICY catalogo_materiales_insert ON catalogo_materiales FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));
CREATE POLICY catalogo_materiales_update ON catalogo_materiales FOR UPDATE
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'))
  WITH CHECK (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));
CREATE POLICY catalogo_materiales_delete ON catalogo_materiales FOR DELETE
  USING (workspace_id = my_workspace_id() AND my_rol() IN ('owner','admin'));

-- Id de la columna cuyo label, sin tildes ni mayúsculas, es uno de `labels`.
CREATE OR REPLACE FUNCTION hoja_columna_id(p_columnas jsonb, p_labels text[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT c->>'id' FROM jsonb_array_elements(coalesce(p_columnas, '[]'::jsonb)) c
  WHERE translate(lower(trim(c->>'label')), 'áéíóú', 'aeiou') = ANY (p_labels)
  LIMIT 1;
$$;

-- 4) Usos por código para ordenar el picker: los míos y los del equipo
-- (hojas con columna Código + semilla). SECURITY INVOKER: RLS de hojas aplica.
CREATE OR REPLACE FUNCTION material_usos()
RETURNS TABLE (codigo text, mios int, equipo int, ultimo_mio timestamptz)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH hojas AS (
    SELECT h.id, h.created_by, hoja_columna_id(h.columnas, ARRAY['codigo']) AS cod
    FROM hojas_inventario h
    WHERE h.workspace_id = my_workspace_id()
      AND h.tipo IN ('materiales_usados', 'materiales_solicitados')
  ), usos AS (
    SELECT h.created_by AS usuario_id, lower(trim(f.celdas->>h.cod)) AS codigo,
           count(*)::int AS veces, max(f.updated_at) AS ultimo
    FROM hojas h JOIN hojas_inventario_filas f ON f.hoja_id = h.id
    WHERE h.cod IS NOT NULL AND coalesce(trim(f.celdas->>h.cod), '') <> ''
    GROUP BY 1, 2
    UNION ALL
    SELECT s.usuario_id, lower(s.codigo), s.veces, s.ultimo_uso
    FROM material_usos_semilla s WHERE s.workspace_id = my_workspace_id()
  )
  SELECT u.codigo,
         coalesce(sum(u.veces) FILTER (WHERE u.usuario_id = auth.uid()), 0)::int,
         sum(u.veces)::int,
         max(u.ultimo) FILTER (WHERE u.usuario_id = auth.uid())
  FROM usos u GROUP BY u.codigo;
$$;

-- 5) Pendientes: filas con Material escrito y Código vacío, en hojas que
-- tienen columna Código (las viejas no la tienen: nunca cuentan).
CREATE OR REPLACE FUNCTION materiales_pendientes()
RETURNS TABLE (fila_id uuid, hoja_id uuid, orden_id uuid, numero int, autor text,
               fecha timestamptz, texto text, cantidad text)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH hojas AS (
    SELECT h.*, hoja_columna_id(h.columnas, ARRAY['codigo']) AS cod,
           hoja_columna_id(h.columnas, ARRAY['material','item','descripcion']) AS mat,
           hoja_columna_id(h.columnas, ARRAY['cantidad']) AS cant
    FROM hojas_inventario h
    WHERE h.workspace_id = my_workspace_id()
      AND h.tipo IN ('materiales_usados', 'materiales_solicitados')
      AND my_rol() IN ('owner', 'admin')
  )
  SELECT f.id, h.id, h.orden_id, o.numero, u.nombre, f.updated_at,
         trim(f.celdas->>h.mat), f.celdas->>h.cant
  FROM hojas h
  JOIN hojas_inventario_filas f ON f.hoja_id = h.id
  LEFT JOIN ordenes_trabajo o ON o.id = h.orden_id
  LEFT JOIN usuarios u ON u.id = h.created_by
  WHERE h.cod IS NOT NULL AND h.mat IS NOT NULL
    AND coalesce(trim(f.celdas->>h.mat), '') <> ''
    AND coalesce(trim(f.celdas->>h.cod), '') = ''
  ORDER BY f.updated_at DESC;
$$;

-- 6) Resolver un pendiente: escribe Material (descripción oficial) + Código en
-- la fila y aprende el alias (texto original → código), en una transacción.
CREATE OR REPLACE FUNCTION resolver_material_pendiente(p_fila_id uuid, p_codigo text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE
  v_fila hojas_inventario_filas;
  v_hoja hojas_inventario;
  v_mat text; v_cod text; v_desc text; v_codigo text;
BEGIN
  IF my_rol() NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'solo owner/admin'; END IF;
  SELECT * INTO v_fila FROM hojas_inventario_filas WHERE id = p_fila_id;
  SELECT * INTO v_hoja FROM hojas_inventario WHERE id = v_fila.hoja_id AND workspace_id = my_workspace_id();
  IF v_hoja.id IS NULL THEN RAISE EXCEPTION 'fila no encontrada'; END IF;
  SELECT codigo, descripcion INTO v_codigo, v_desc FROM catalogo_materiales
    WHERE workspace_id = v_hoja.workspace_id AND lower(codigo) = lower(p_codigo);
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'código % no está en el catálogo', p_codigo; END IF;
  v_mat := hoja_columna_id(v_hoja.columnas, ARRAY['material','item','descripcion']);
  v_cod := hoja_columna_id(v_hoja.columnas, ARRAY['codigo']);
  INSERT INTO material_alias (workspace_id, texto_norm, codigo)
  VALUES (v_hoja.workspace_id,
          translate(lower(trim(v_fila.celdas->>v_mat)), 'áéíóú', 'aeiou'), v_codigo)
  ON CONFLICT (workspace_id, texto_norm) DO UPDATE SET codigo = EXCLUDED.codigo;
  UPDATE hojas_inventario_filas
     SET celdas = celdas || jsonb_build_object(v_mat, v_desc, v_cod, v_codigo)
   WHERE id = p_fila_id;
END;
$$;

GRANT EXECUTE ON FUNCTION material_usos(), materiales_pendientes(),
  resolver_material_pendiente(uuid, text), hoja_columna_id(jsonb, text[]) TO authenticated;
```

- [ ] **Step 2: Probar en seco en prod (rollback)**

Con MCP `execute_sql`, correr el SQL envuelto en `BEGIN; … ROLLBACK;`. Expected: sin error. Antes de esa prueba, confirmar que `my_rol()` devuelve `'owner'`/`'admin'` en minúsculas: `select distinct rol from usuarios;`.

- [ ] **Step 3: Aplicar**

MCP `apply_migration` con name `materiales_picker`. Si lo rechaza, darle el SQL al usuario y esperar.
Verificar: `select count(*) from material_alias; select proname from pg_proc where proname in ('material_usos','materiales_pendientes','resolver_material_pendiente');` → 0 y 3 filas.

- [ ] **Step 4: Commit** (repo web)

```bash
git add supabase/migrations/20261110120000_materiales_picker.sql
git commit -m "feat(materiales): alias, semilla de usos y RPCs del picker"
```

---

### Task 2: `lib/materiales-busqueda.ts` (web, archivo compartido)

**Files:**
- Create: `C:\dev\pangui\lib\materiales-busqueda.ts`
- Test: `C:\dev\pangui\tests\lib\materiales-busqueda.test.ts`

**Interfaces:**
- Consumes: `codigosDeTexto(textoNorm, ok)` de `./cobros-diccionario`.
- Produces:
  ```ts
  export interface Material { codigo: string; descripcion: string; unidad: string; clasificacion: string }
  export interface Uso { codigo: string; mios: number; equipo: number; ultimo_mio: string | null } // codigo en minúsculas
  export function normMaterial(s: string): string
  export function columnasMaterial(columnas: { id: string; label: string }[]): { material: string; codigo: string } | null
  export function buscarEnCatalogo(p: { texto: string; categoria?: string | null; catalogo: Material[];
    alias: Map<string, string>; usos: Map<string, Uso>; ahora?: number; limite?: number }): Material[]
  ```

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { buscarEnCatalogo, columnasMaterial, normMaterial, type Material, type Uso } from "@/lib/materiales-busqueda";

const m = (codigo: string, descripcion: string, clasificacion = "Protecciones"): Material =>
  ({ codigo, descripcion, unidad: "un", clasificacion });
const catalogo = [
  m("ITM1x10a", "Interruptor termomagnético 1x10A"),
  m("ITM1x16a", "Interruptor termomagnético 1x16A"),
  m("tab12", "Tablero 12 módulos", "Tablero"),
  m("tab24", "Tablero 24 módulos", "Tablero"),
  m("cajpla", "Caja plástica chuqui", "Caja"),
];
const AHORA = Date.parse("2026-11-10T12:00:00Z");
const usos = (...u: [string, number, number, string | null][]) =>
  new Map(u.map(([codigo, mios, equipo, ultimo_mio]) => [codigo.toLowerCase(), { codigo: codigo.toLowerCase(), mios, equipo, ultimo_mio } as Uso]));
const buscar = (texto: string, extra: Partial<Parameters<typeof buscarEnCatalogo>[0]> = {}) =>
  buscarEnCatalogo({ texto, catalogo, alias: new Map(), usos: new Map(), ahora: AHORA, ...extra }).map((x) => x.codigo);

describe("buscarEnCatalogo", () => {
  it("código exacto primero aunque otro se use más", () => {
    expect(buscar("itm1x16a", { usos: usos(["ITM1x10a", 50, 50, "2026-11-01"]) })[0]).toBe("ITM1x16a");
  });
  it("lo mío antes que lo del equipo, y lo del equipo antes que lo no usado", () => {
    expect(buscar("tablero", { usos: usos(["tab24", 3, 3, "2026-11-01"]) })).toEqual(["tab24", "tab12"]);
    expect(buscar("tablero", { usos: usos(["tab12", 0, 40, null]) })).toEqual(["tab12", "tab24"]);
    expect(buscar("tablero", { usos: usos(["tab24", 1, 1, "2026-11-09"], ["tab12", 0, 5, null]) })).toEqual(["tab24", "tab12"]);
  });
  it("lo reciente pesa más que lo viejo", () => {
    const u = usos(["tab12", 4, 4, "2026-02-01"], ["tab24", 3, 3, "2026-11-05"]);
    expect(buscar("tablero", { usos: u })[0]).toBe("tab24");
  });
  it("todas las palabras como prefijo, sin tildes", () => {
    expect(buscar("interr termo 10")).toEqual(["ITM1x10a"]);
    expect(buscar("modulos")).toEqual(["tab12", "tab24"]);
  });
  it("alias y diccionario", () => {
    expect(buscar("caja chuky")).toContain("cajpla");
    expect(buscar("la cosa gris", { alias: new Map([["la cosa gris", "tab12"]]) })).toEqual(["tab12"]);
  });
  it("chip de categoría filtra; sin texto muestra solo lo usado", () => {
    expect(buscar("", { categoria: "Tablero", usos: usos(["tab24", 2, 2, "2026-11-01"], ["cajpla", 9, 9, "2026-11-01"]) })).toEqual(["tab24"]);
    expect(buscar("")).toEqual([]);
  });
});

describe("columnasMaterial", () => {
  it("detecta por label, sin tildes", () => {
    expect(columnasMaterial([{ id: "a", label: "Material" }, { id: "b", label: "Código" }])).toEqual({ material: "a", codigo: "b" });
    expect(columnasMaterial([{ id: "a", label: "Ítem" }, { id: "b", label: "codigo" }])).toEqual({ material: "a", codigo: "b" });
    expect(columnasMaterial([{ id: "a", label: "Material" }])).toBeNull();
  });
  it("normMaterial", () => expect(normMaterial("  Caja CHUKY ")).toBe("caja chuky"));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/lib/materiales-busqueda.test.ts`
Expected: FAIL, no se resuelve `@/lib/materiales-busqueda`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Búsqueda y orden del picker de materiales (Electrilam). Sin dependencias:
 * este archivo se copia IGUAL en pangui-native-sdk57/lib (como hoja-formulas.ts),
 * y lo usan la grilla web, la bandeja de pendientes y el picker de mobile.
 *
 * Orden: código exacto → lo que más usa este maestro (lo reciente pesa más) →
 * lo que usa el equipo → alfabético por código.
 */
import { codigosDeTexto } from "./cobros-diccionario";

export interface Material { codigo: string; descripcion: string; unidad: string; clasificacion: string }
/** Usos por código (en minúsculas), de la RPC material_usos. */
export interface Uso { codigo: string; mios: number; equipo: number; ultimo_mio: string | null }

const MEDIA_VIDA_DIAS = 90;
const PESO_EQUIPO = 0.1;

export function normMaterial(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Columnas Material y Código por label (las hojas web tienen ids aleatorios). */
export function columnasMaterial(columnas: { id: string; label: string }[]): { material: string; codigo: string } | null {
  const id = (...labels: string[]) => columnas.find((c) => labels.includes(normMaterial(c.label)))?.id;
  const material = id("material", "item", "descripcion");
  const codigo = id("codigo");
  return material && codigo ? { material, codigo } : null;
}

function puntaje(u: Uso | undefined, ahora: number): number {
  if (!u) return 0;
  const dias = u.ultimo_mio ? Math.max(0, (ahora - Date.parse(u.ultimo_mio)) / 86400000) : Infinity;
  const mios = u.mios * Math.pow(0.5, dias / MEDIA_VIDA_DIAS);
  return mios + u.equipo * PESO_EQUIPO;
}

export function buscarEnCatalogo({ texto, categoria, catalogo, alias, usos, ahora = Date.now(), limite = 50 }: {
  texto: string; categoria?: string | null; catalogo: Material[];
  alias: Map<string, string>; usos: Map<string, Uso>; ahora?: number; limite?: number;
}): Material[] {
  const t = normMaterial(texto);
  const base = categoria ? catalogo.filter((m) => m.clasificacion === categoria) : catalogo;
  const porCodigo = new Map(catalogo.map((m) => [m.codigo.toLowerCase(), m]));

  let candidatos: Material[];
  if (!t) {
    candidatos = base.filter((m) => usos.has(m.codigo.toLowerCase()));
  } else {
    const palabras = t.split(" ");
    const extra = new Set<string>();
    const a = alias.get(t);
    if (a) extra.add(a.toLowerCase());
    for (const c of codigosDeTexto(t, (c) => porCodigo.get(c.toLowerCase())?.codigo) ?? []) extra.add(c.toLowerCase());
    candidatos = base.filter((m) => {
      const cod = m.codigo.toLowerCase();
      if (cod.includes(t) || extra.has(cod)) return true;
      const desc = normMaterial(m.descripcion).split(" ");
      return palabras.every((p) => desc.some((d) => d.startsWith(p)));
    });
  }

  return candidatos
    .map((m) => ({ m, exacto: m.codigo.toLowerCase() === t, p: puntaje(usos.get(m.codigo.toLowerCase()), ahora) }))
    .sort((x, y) => Number(y.exacto) - Number(x.exacto) || y.p - x.p || x.m.codigo.localeCompare(y.m.codigo))
    .slice(0, limite)
    .map((x) => x.m);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/lib/materiales-busqueda.test.ts`
Expected: PASS. Si "caja chuky" no da `cajpla`, revisar qué propone `codigosDeTexto("caja chuqui", …)` en `tests/lib/cobros-diccionario.test.ts` y ajustar el **test**, no el diccionario: el código esperado tiene que salir del caso real del diccionario.

- [ ] **Step 5: Commit**

```bash
git add lib/materiales-busqueda.ts tests/lib/materiales-busqueda.test.ts
git commit -m "feat(materiales): búsqueda y orden personal del picker"
```

---

### Task 3: Web — catálogo, alias y usos (TanStack) + plantilla con Código

**Files:**
- Modify: `C:\dev\pangui\lib\catalogo-api.ts` (agregar `fetchAlias`, `fetchUsos`)
- Create: `C:\dev\pangui\lib\use-materiales.ts`
- Modify: `C:\dev\pangui\lib\hojas-api.ts:14-30` (`HOJA_TEMPLATES`) y `:122` (`createHoja`)
- Test: `C:\dev\pangui\tests\lib\hojas-plantilla.test.ts`

**Interfaces:**
- Consumes: `todoElCatalogo(workspaceId)` (ya existe en `catalogo-api.ts:74`), `Material`, `Uso`.
- Produces:
  ```ts
  export async function fetchAlias(workspaceId: string): Promise<Map<string, string>>
  export async function fetchUsos(): Promise<Map<string, Uso>>
  export function useMateriales(workspaceId: string | null): { catalogo: Material[]; alias: Map<string,string>; usos: Map<string,Uso>; listo: boolean }
  export function columnasDeTipo(tipo: HojaTipo, workspaceId: string): Omit<HojaColumna, "id">[]
  ```

- [ ] **Step 1: Test de la plantilla**

```ts
import { describe, expect, it } from "vitest";
import { columnasDeTipo } from "@/lib/hojas-api";

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";
describe("columnasDeTipo", () => {
  it("Electrilam: usados y solicitados llevan Código después de Material", () => {
    for (const tipo of ["materiales_usados", "materiales_solicitados"] as const) {
      const labels = columnasDeTipo(tipo, ELECTRILAM).map((c) => c.label);
      expect(labels.indexOf("Código")).toBe(labels.indexOf("Material") + 1);
    }
  });
  it("otros workspaces y hoja general: sin Código", () => {
    expect(columnasDeTipo("materiales_usados", "otro").map((c) => c.label)).not.toContain("Código");
    expect(columnasDeTipo("general", ELECTRILAM).map((c) => c.label)).not.toContain("Código");
  });
});
```

- [ ] **Step 2: Correr → FAIL** (`columnasDeTipo` no existe). Run: `npx vitest run tests/lib/hojas-plantilla.test.ts`

- [ ] **Step 3: Implementar en `lib/hojas-api.ts`**

Leer `HOJA_TEMPLATES` (línea 14) para confirmar que la columna de material se llama "Material" en los dos tipos (si no, ajustar el test al label real). Agregar abajo:

```ts
import { tieneCobros } from "@/lib/catalogo-api";

/** Columnas con que nace una hoja. En Electrilam, las de materiales llevan
 * "Código" al lado de Material: la llena el picker, nunca el teclado. */
export function columnasDeTipo(tipo: HojaTipo, workspaceId: string): Omit<HojaColumna, "id">[] {
  const base = HOJA_TEMPLATES[tipo].columnas;
  if (!tieneCobros(workspaceId) || (tipo !== "materiales_usados" && tipo !== "materiales_solicitados")) return base;
  const i = base.findIndex((c) => c.label === "Material");
  return [...base.slice(0, i + 1), { label: "Código", tipo: "texto" } as Omit<HojaColumna, "id">, ...base.slice(i + 1)];
}
```

y en `createHoja` cambiar `template.columnas.map(...)` por `columnasDeTipo(tipo, workspaceId).map(...)`. Si importar `catalogo-api` desde `hojas-api` genera un ciclo, mover `tieneCobros` no hace falta: comparar directo contra `ELECTRILAM_WORKSPACE_ID` de `@/lib/itos-gate`.

- [ ] **Step 4: Agregar a `lib/catalogo-api.ts`**

```ts
import { normMaterial, type Uso } from "@/lib/materiales-busqueda";

export async function fetchAlias(workspaceId: string): Promise<Map<string, string>> {
  const { data, error } = await createClient().from("material_alias").select("texto_norm, codigo").eq("workspace_id", workspaceId);
  if (error) throw error;
  return new Map((data ?? []).map((a) => [normMaterial(a.texto_norm), a.codigo]));
}

export async function fetchUsos(): Promise<Map<string, Uso>> {
  const { data, error } = await createClient().rpc("material_usos");
  if (error) throw error;
  return new Map(((data ?? []) as Uso[]).map((u) => [u.codigo, u]));
}
```

- [ ] **Step 5: Crear `lib/use-materiales.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchAlias, fetchUsos, todoElCatalogo, tieneCobros } from "@/lib/catalogo-api";
import type { Material, Uso } from "@/lib/materiales-busqueda";

const VACIO_A = new Map<string, string>();
const VACIO_U = new Map<string, Uso>();

/** Catálogo + alias + usos, cargados una vez: la búsqueda corre en el navegador. */
export function useMateriales(workspaceId: string | null) {
  const on = !!workspaceId && tieneCobros(workspaceId);
  const cat = useQuery({ queryKey: ["materiales", "catalogo", workspaceId], queryFn: () => todoElCatalogo(workspaceId!), enabled: on, staleTime: Infinity });
  const ali = useQuery({ queryKey: ["materiales", "alias", workspaceId], queryFn: () => fetchAlias(workspaceId!), enabled: on, staleTime: 10 * 60_000 });
  const uso = useQuery({ queryKey: ["materiales", "usos", workspaceId], queryFn: fetchUsos, enabled: on, staleTime: 10 * 60_000 });
  return {
    catalogo: (cat.data ?? []) as Material[],
    alias: ali.data ?? VACIO_A,
    usos: uso.data ?? VACIO_U,
    listo: cat.isSuccess,
  };
}
```

- [ ] **Step 6: `npx vitest run tests/lib/hojas-plantilla.test.ts` → PASS; `npx tsc --noEmit` → sin errores nuevos.**

- [ ] **Step 7: Commit**

```bash
git add lib/hojas-api.ts lib/catalogo-api.ts lib/use-materiales.ts tests/lib/hojas-plantilla.test.ts
git commit -m "feat(materiales): columna Código en hojas de Electrilam + datos del picker"
```

---

### Task 4: Web — la celda Material usa el picker en la grilla

**Files:**
- Modify: `C:\dev\pangui\components\HojaSpreadsheet.tsx` (líneas ~262-272 `colCodigoId`/`sugerirMaterial`, ~369 `terminar`, ~386 `guardar`, ~852-868 render de `Cell`, ~93-200 `Cell`)

**Interfaces:**
- Consumes: `useMateriales`, `buscarEnCatalogo`, `columnasMaterial`, `Material`.

Hoy la grilla ya tiene autocompletar, pero solo en la columna Código de hojas tipo `cobro`: `sugerir` es async y `onElegir(codigo)` escribe una celda. Este cambio lo extiende sin romper `cobro`.

- [ ] **Step 1: Cambiar `Cell` a sugerencias síncronas que entregan el `Material` completo**

En `Cell`: `sugerir?: (texto: string) => MaterialCatalogo[]` (sin Promise) y `onElegir: (m: MaterialCatalogo) => void`. `buscar(texto)` pasa a `setOpciones(sugerir ? sugerir(texto) : [])`, y se quitan el debounce y `pedido`. `elegir(m)` llama `onElegir(m)`. El resto del dropdown queda igual. Agregar una última opción fija cuando hay texto y `onNoListado` viene dado:

```tsx
{value.trim() && onNoListado && (
  <div onMouseDown={e => { e.preventDefault(); setOpciones([]); onNoListado(); }}
       style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13, color: "var(--fg-2)" }}>
    No encontré «{value.trim()}» → anotar como no listado
  </div>
)}
```

(`onNoListado?: () => void` es prop nueva de `Cell`. El dropdown se muestra si `opciones.length > 0 || (value.trim() && onNoListado)`).

- [ ] **Step 2: En la grilla, detectar las columnas y armar `sugerir`**

Ojo con los nombres: `@/lib/catalogo-api` ya exporta un `buscarMateriales` async (búsqueda en el servidor). La función compartida se llama `buscarEnCatalogo` justamente para no chocar. En la línea 19, cambiar el import a `import { tieneCobros } from "@/lib/catalogo-api";` y agregar `import { buscarEnCatalogo, columnasMaterial } from "@/lib/materiales-busqueda";` + `import { useMateriales } from "@/lib/use-materiales";`. El `buscarMateriales` de catalogo-api queda sin usar en la grilla; no se borra en este plan.

Reemplazar el bloque `colCodigoId`/`sugerirMaterial` (~262-272) por:

```tsx
const mats = useMateriales(workspaceId);
// Picker de catálogo: hojas de Electrilam con columnas Material + Código.
const colsMat = useMemo(
  () => (tieneCobros(workspaceId) ? columnasMaterial(hoja.columnas) : null),
  [hoja.columnas, workspaceId],
);
// Hoja tipo cobro (vieja): autocompletar solo en Código, como antes.
const colCodigoCobro = useMemo(
  () => (hoja.tipo === "cobro" && tieneCobros(workspaceId)
    ? hoja.columnas.find(c => c.label.trim().toLowerCase() === COLUMNA_CODIGO.toLowerCase())?.id
    : undefined),
  [hoja.tipo, hoja.columnas, workspaceId],
);
const sugerirMaterial = useCallback(
  (texto: string) => buscarEnCatalogo({ texto, catalogo: mats.catalogo, alias: mats.alias, usos: mats.usos, limite: 20 }),
  [mats.catalogo, mats.alias, mats.usos],
);
```

- [ ] **Step 3: Elegir escribe Material + Código en un solo guardado**

Agregar al lado de `guardar` (~386):

```tsx
/** Elegir del catálogo: Material = descripción oficial, Código = código, en un guardado. */
function guardarMaterial(r: number, m: MaterialCatalogo) {
  if (!colsMat) return;
  const fila = filas[r];
  if (!fila) return;
  const celdas = { ...fila.celdas, [colsMat.material]: m.descripcion, [colsMat.codigo]: m.codigo };
  setFilas(prev => prev.map(f => (f.id === fila.id ? { ...f, celdas } : f)));
  void updateFila(fila.id, celdas);
}
```

Antes de pegarlo, leer `guardar` completo (~386-410): si encola guardados por fila en `colas.current` para no pisarse, `guardarMaterial` tiene que pasar por esa misma cola. Copiar su patrón; no hacer una llamada suelta a `updateFila` si `guardar` no la hace.

- [ ] **Step 4: Cablear en el render de celdas (~852-868)**

```tsx
const esMat = colsMat && (col.id === colsMat.material || col.id === colsMat.codigo);
...
sugerir={esMat || col.id === colCodigoCobro ? sugerirMaterial : undefined}
onElegir={m => {
  if (esMat) { terminar(true); guardarMaterial(rowIdx, m); }
  else terminar(false, undefined, m.codigo);
}}
onNoListado={esMat && col.id === colsMat!.material ? () => terminar(false) : undefined}
```

"No listado" guarda lo escrito en Material y deja Código vacío: eso ya es un pendiente. En la columna Código no se puede escribir texto libre: si `col.id === colsMat?.codigo` y el valor final no es un código del catálogo, `terminar` lo descarta. Implementarlo en `terminar`: si `colsMat && col.id === colsMat.codigo && final && !mats.catalogo.some(m => m.codigo.toLowerCase() === final.toLowerCase())`, cancelar.

- [ ] **Step 5: Verificar en el navegador**

`npx tsc --noEmit`. Levantar `npm run dev`, entrar con un usuario de Electrilam (pedirle al usuario la sesión si no hay una), crear una hoja "Materiales usados" en una OT de prueba y probar:
(a) la hoja nace con Código;
(b) escribir "tablero" muestra opciones y elegir llena las dos celdas;
(c) "No encontré…" deja Material con el texto y Código vacío;
(d) una hoja tipo `cobro` vieja sigue autocompletando Código.
Borrar la OT de prueba al terminar.

- [ ] **Step 6: Commit**

```bash
git add components/HojaSpreadsheet.tsx
git commit -m "feat(materiales): picker de catálogo en la celda Material (web)"
```

---

### Task 5: Web — bandeja de pendientes

**Files:**
- Create: `C:\dev\pangui\app\(app)\ordenes\MaterialesPendientes.tsx`
- Modify: `C:\dev\pangui\app\(app)\ordenes\OrdenesBandeja.tsx:1734` (botón al lado de `ExportCobros`)
- Modify: `C:\dev\pangui\lib\catalogo-api.ts` (`fetchPendientes`, `resolverPendiente`, `crearMaterial`)

**Interfaces:**
- Consumes: RPCs `materiales_pendientes`, `resolver_material_pendiente`; `useMateriales`; `buscarEnCatalogo`.
- Produces:
  ```ts
  export interface Pendiente { fila_id: string; hoja_id: string; orden_id: string | null; numero: number | null; autor: string | null; fecha: string; texto: string; cantidad: string | null }
  export async function fetchPendientes(): Promise<Pendiente[]>
  export async function resolverPendiente(filaId: string, codigo: string): Promise<void>
  export async function crearMaterial(workspaceId: string, m: Material): Promise<void>
  ```

- [ ] **Step 1: API en `lib/catalogo-api.ts`**

```ts
export interface Pendiente { fila_id: string; hoja_id: string; orden_id: string | null; numero: number | null; autor: string | null; fecha: string; texto: string; cantidad: string | null }

export async function fetchPendientes(): Promise<Pendiente[]> {
  const { data, error } = await createClient().rpc("materiales_pendientes");
  if (error) throw error;
  return (data ?? []) as Pendiente[];
}

/** Escribe Material + Código en la fila y aprende el alias (RPC, una transacción). */
export async function resolverPendiente(filaId: string, codigo: string): Promise<void> {
  const { error } = await createClient().rpc("resolver_material_pendiente", { p_fila_id: filaId, p_codigo: codigo });
  if (error) throw error;
}

/** Código nuevo en el catálogo (solo owner/admin por RLS). */
export async function crearMaterial(workspaceId: string, m: Material): Promise<void> {
  const { error } = await createClient().from("catalogo_materiales").insert({ workspace_id: workspaceId, ...m });
  if (error) throw error;
}
```

- [ ] **Step 2: Componente `MaterialesPendientes.tsx`**

Es un modal con el mismo patrón visual que `ExportCobros.tsx`: leerlo primero y copiar su contenedor y sus estilos (estilos inline + vars de la app; **no** usar componentes shadcn, que se ven rotos). Estructura:

```tsx
"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crearMaterial, fetchPendientes, resolverPendiente, type Pendiente } from "@/lib/catalogo-api";
import { useMateriales } from "@/lib/use-materiales";
import { buscarEnCatalogo, type Material } from "@/lib/materiales-busqueda";

export default function MaterialesPendientes({ wsId }: { wsId: string }) {
  const [abierto, setAbierto] = useState(false);
  const qc = useQueryClient();
  const { data: pendientes = [] } = useQuery({ queryKey: ["materiales", "pendientes", wsId], queryFn: fetchPendientes, staleTime: 60_000 });
  const mats = useMateriales(wsId);
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["materiales"] });
  };
  // Botón "Pendientes (N)" → modal con una fila por Pendiente:
  //   #numero · autor · fecha · «texto» × cantidad
  //   [input buscar] → lista buscarEnCatalogo({ texto, catalogo: mats.catalogo, alias: mats.alias, usos: mats.usos, limite: 8 })
  //   clic en una opción → await resolverPendiente(p.fila_id, m.codigo); refrescar()
  //   "Crear código" → form inline (codigo, descripcion, unidad, clasificacion: <select> con las clasificaciones de mats.catalogo)
  //      → await crearMaterial(wsId, nuevo); await resolverPendiente(p.fila_id, nuevo.codigo); refrescar()
  // Errores: alert con error.message (p. ej. "código duplicado").
  // ...
}
```

Escribir el JSX completo según ese esquema. Cada fila resuelta desaparece al refrescar, porque la RPC ya no la devuelve.

- [ ] **Step 3: Montarlo en la bandeja**

En `OrdenesBandeja.tsx:1734`, al lado de `ExportCobros`:

```tsx
{puedeCobrar && <MaterialesPendientes wsId={wsId} />}
```

(`puedeCobrar = esAdmin(myRol) && tieneCobros(wsId)` ya existe en la línea 1077.)

- [ ] **Step 4: Verificar en el navegador**

Con la fila "no listado" de la Task 4: aparece en Pendientes, elegir un código la saca, y en la hoja quedan Material = descripción oficial y Código lleno. Comprobar `select * from material_alias` → 1 fila con el texto original. Probar también "Crear código" con un código de prueba y **borrarlo después** (`delete from catalogo_materiales where codigo = '<prueba>'`).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ordenes/MaterialesPendientes.tsx" "app/(app)/ordenes/OrdenesBandeja.tsx" lib/catalogo-api.ts
git commit -m "feat(materiales): bandeja de pendientes para resolver materiales no listados"
```

---

### Task 6: Export de cobros — código directo + respaldo de solicitados

**Files:**
- Modify: `C:\dev\pangui\lib\cobros-excel.ts:107-140` (`lineasDeOt`)
- Test: `C:\dev\pangui\tests\lib\cobros-excel.test.ts`

**Interfaces:**
- Consumes: `OtCobro`, `HojaCobro`, `lineasDeOt(ot, catalogo)` (sin cambio de firma).

- [ ] **Step 1: Tests que fallan** (agregar a `cobros-excel.test.ts`, que ya tiene los helpers `hoja`, `ot`, `catalogo`)

```ts
describe("lineasDeOt: picker de materiales", () => {
  const COLS_PICKER = [{ id: "m", label: "Material" }, { id: "k", label: "Código" }, { id: "q", label: "Cantidad" }];
  const hojaPicker = (tipo: string, ...filas: [string, string, string][]): HojaCobro =>
    ({ tipo, columnas: COLS_PICKER, filas: filas.map(([m, k, q]) => ({ m, k, q })) });

  it("si la fila trae Código, se usa tal cual (sin diccionario)", () => {
    const l = lineasDeOt(ot([hojaPicker("materiales_usados", ["Lo que sea", "tab12", "2"])]), catalogo);
    expect(l.find((x) => x.codigo === "tab12")?.cantidad).toBe(2);
  });

  it("sin hoja de usados, toma solicitados marcados (según solicitud)", () => {
    const l = lineasDeOt(ot([hojaPicker("materiales_solicitados", ["Tablero 12", "tab12", "1"])]), catalogo);
    expect(l.find((x) => x.codigo === "tab12")?.texto).toMatch(/según solicitud/);
  });

  it("con hoja de usados con filas, solicitados se sigue ignorando", () => {
    const l = lineasDeOt(ot([
      hojaPicker("materiales_usados", ["Tablero 24", "tab24", "1"]),
      hojaPicker("materiales_solicitados", ["Tablero 12", "tab12", "1"]),
    ]), catalogo);
    expect(l.some((x) => x.codigo === "tab12")).toBe(false);
  });
});
```

(Si `catalogo` del test no tiene `tab12`/`tab24`, usar dos códigos que sí estén en ese mapa: revisar su definición arriba del archivo. El código directo no necesita estar en el mapa.)

- [ ] **Step 2: Correr → FAIL.** `npx vitest run tests/lib/cobros-excel.test.ts`

- [ ] **Step 3: Implementar en `lineasDeOt`**

Antes del `for (const hoja of ot.hojas)`:

```ts
// Si nadie llenó lo usado, lo solicitado es lo mejor que hay (marcado como tal).
const conFilas = (h: HojaCobro) => h.filas.some((f) => Object.values(f).some((v) => String(v ?? "").trim()));
const sinUsados = !ot.hojas.some((h) => (h.tipo === "materiales_usados" || h.tipo === "cobro") && conFilas(h));
```

Cambiar el `continue` de solicitados por:

```ts
if (hoja.tipo === "materiales_solicitados" && !sinUsados) continue; // lo pedido no es lo usado
const sufijo = hoja.tipo === "materiales_solicitados" ? " (según solicitud)" : "";
```

Generalizar el bloque `if (hoja.tipo === "cobro" && cCodigo)` para que, en cualquier hoja con `cCodigo` y código en la fila, use el código directo. Si la fila no trae código, sigue el flujo de texto como hoy:

```ts
if (cCodigo) {
  const codigo = String(f[cCodigo] ?? "").trim();
  if (codigo) {
    materiales.push({ texto: [cant, (obs || item || codigo) + sufijo].filter(Boolean).join(" "), codigo, cantidad: numero(cant) ?? undefined });
    continue;
  }
  if (hoja.tipo === "cobro") continue; // hoja de cobro sin código: como antes
}
```

y agregar `sufijo` al `texto` de las otras `materiales.push` de esa función (buscarlas en las líneas 160-200). `notas`, horas y personas de solicitados no se tocan: solo los materiales llevan sufijo.

- [ ] **Step 4: Correr todo el archivo → PASS** (incluye los tests viejos de mano de obra). `npx vitest run tests/lib/cobros-excel.test.ts tests/lib/cobros-diccionario.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/cobros-excel.ts tests/lib/cobros-excel.test.ts
git commit -m "feat(cobros): código directo de la hoja y solicitados como respaldo"
```

---

### Task 7: Semilla de usos históricos

**Files:**
- Create: `C:\dev\pangui\scripts\semilla-usos-materiales.ts`
- Test: `C:\dev\pangui\tests\lib\semilla-usos.test.ts`

**Interfaces:**
- Consumes: `codigosDeTexto`, `normMaterial`, `columnasMaterial`, `Material`.
- Produces: `export function semilla(filas: FilaHist[], catalogo: Material[]): { usuario_id: string; codigo: string; veces: number; ultimo_uso: string }[]` con `FilaHist = { created_by: string; columnas: {id:string;label:string}[]; celdas: Record<string,string>; updated_at: string }`.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { semilla } from "@/scripts/semilla-usos-materiales";

const cat = [{ codigo: "cajpla", descripcion: "Caja plástica chuqui", unidad: "un", clasificacion: "Caja" }];
const fila = (u: string, item: string, fecha: string) =>
  ({ created_by: u, columnas: [{ id: "a", label: "Ítem" }, { id: "b", label: "Cantidad" }], celdas: { a: item, b: "1" }, updated_at: fecha });

describe("semilla", () => {
  it("cuenta por maestro y código, con la última fecha", () => {
    expect(semilla([fila("u1", "caja chuky", "2026-07-01"), fila("u1", "2 cajas chuqui", "2026-08-01"), fila("u2", "cosa rara", "2026-08-01")], cat))
      .toEqual([{ usuario_id: "u1", codigo: "cajpla", veces: 2, ultimo_uso: "2026-08-01" }]);
  });
});
```

(Si `codigosDeTexto` no mapea "caja chuky" a `cajpla`, usar en el test un texto que **sí** esté cubierto en `tests/lib/cobros-diccionario.test.ts`.)

- [ ] **Step 2: Correr → FAIL.** `npx vitest run tests/lib/semilla-usos.test.ts`

- [ ] **Step 3: Implementar**

```ts
/**
 * Semilla de usos (una sola vez): el texto libre histórico de cada maestro,
 * pasado por el diccionario de cobros, para que el picker ya los conozca el
 * primer día. Uso:
 *   npx tsx scripts/semilla-usos-materiales.ts filas.json catalogo.json > semilla.sql
 * (filas.json y catalogo.json se sacan con MCP execute_sql; ver el plan.)
 */
import { readFileSync } from "node:fs";
import { codigosDeTexto } from "../lib/cobros-diccionario";
import { normMaterial, type Material } from "../lib/materiales-busqueda";

export type FilaHist = { created_by: string; columnas: { id: string; label: string }[]; celdas: Record<string, string>; updated_at: string };

export function semilla(filas: FilaHist[], catalogo: Material[]) {
  const ok = new Map(catalogo.map((m) => [m.codigo.toLowerCase(), m.codigo]));
  const porDesc = new Map(catalogo.map((m) => [normMaterial(m.descripcion), m.codigo]));
  const acc = new Map<string, { usuario_id: string; codigo: string; veces: number; ultimo_uso: string }>();
  for (const f of filas) {
    const col = f.columnas.find((c) => ["material", "item", "descripcion"].includes(normMaterial(c.label)))?.id ?? f.columnas[0]?.id;
    const t = normMaterial(String(f.celdas[col ?? ""] ?? ""));
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

if (process.argv[1]?.endsWith("semilla-usos-materiales.ts")) {
  const [filasPath, catPath, ws = "f1b64714-6de2-4d49-b6e4-5959553e94d7"] = process.argv.slice(2);
  const filas = JSON.parse(readFileSync(filasPath, "utf8")) as FilaHist[];
  const cat = JSON.parse(readFileSync(catPath, "utf8")) as Material[];
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const vals = semilla(filas, cat).map((r) => `(${q(ws)}, ${q(r.usuario_id)}, ${q(r.codigo)}, ${r.veces}, ${q(r.ultimo_uso)})`);
  console.log(`insert into material_usos_semilla (workspace_id, usuario_id, codigo, veces, ultimo_uso) values\n${vals.join(",\n")}\non conflict do nothing;`);
}
```

- [ ] **Step 4: PASS.** `npx vitest run tests/lib/semilla-usos.test.ts`

- [ ] **Step 5: Generar y aplicar**

Con MCP `execute_sql`, sacar los datos (Electrilam, hojas de materiales usados) y guardarlos como JSON en el scratchpad:

```sql
select h.created_by, h.columnas, f.celdas, f.updated_at
from hojas_inventario h join hojas_inventario_filas f on f.hoja_id = h.id
where h.workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7' and h.tipo in ('materiales_usados','cobro');
```

```sql
select codigo, descripcion, unidad, clasificacion from catalogo_materiales where workspace_id = 'f1b64714-6de2-4d49-b6e4-5959553e94d7';
```

Run: `npx tsx scripts/semilla-usos-materiales.ts <scratchpad>/filas.json <scratchpad>/catalogo.json > <scratchpad>/semilla.sql`. Revisar el top 10 por `veces` (que tenga sentido para alguien que conozca el oficio) y aplicar con `execute_sql`. Verificar con `select count(*), sum(veces) from material_usos_semilla;`.

- [ ] **Step 6: Commit**

```bash
git add scripts/semilla-usos-materiales.ts tests/lib/semilla-usos.test.ts
git commit -m "feat(materiales): semilla de usos históricos desde el diccionario"
```

---

### Task 8: Mobile — archivos compartidos + datos offline

**Files (repo `C:\dev\pangui-native-sdk57`):**
- Create (copias): `lib/materiales-busqueda.ts`, `lib/cobros-diccionario.ts`
- Create: `tests/materiales-busqueda.test.ts` (copia del test web con el import cambiado a `../lib/materiales-busqueda`)
- Modify: `vitest.config.ts` (agregar el test al `include`; la lista es explícita)
- Create: `features/materiales/api.ts`, `features/materiales/hooks.ts`

**Interfaces:**
- Produces: `useMateriales(): { catalogo: Material[]; alias: Map<string,string>; usos: Map<string,Uso>; listo: boolean; activo: boolean }` (`activo` = el workspace es Electrilam).

- [ ] **Step 1: Copiar los archivos compartidos y el test**

```bash
cp /c/dev/pangui/lib/materiales-busqueda.ts /c/dev/pangui/lib/cobros-diccionario.ts /c/dev/pangui-native-sdk57/lib/
sed 's#@/lib/materiales-busqueda#../lib/materiales-busqueda#' /c/dev/pangui/tests/lib/materiales-busqueda.test.ts > /c/dev/pangui-native-sdk57/tests/materiales-busqueda.test.ts
```

Agregar `"tests/materiales-busqueda.test.ts"` al `include` de `vitest.config.ts`.
Run: `npx vitest run tests/materiales-busqueda.test.ts` → PASS.

- [ ] **Step 2: `features/materiales/api.ts`**

```ts
// Catálogo, alias y usos del picker de materiales (Electrilam). Se bajan una
// vez y se guardan en TanStack: la búsqueda corre en el teléfono y sin señal.
import { supabase } from "../../lib/supabase";
import { normMaterial, type Material, type Uso } from "../../lib/materiales-busqueda";

export async function fetchCatalogo(workspaceId: string): Promise<Material[]> {
  const out: Material[] = [];
  // PostgREST corta en 1000 filas: se pagina.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("catalogo_materiales")
      .select("codigo, descripcion, unidad, clasificacion")
      .eq("workspace_id", workspaceId).order("codigo").range(desde, desde + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Material[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function fetchAlias(workspaceId: string): Promise<[string, string][]> {
  const { data, error } = await supabase.from("material_alias").select("texto_norm, codigo").eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data ?? []).map((a) => [normMaterial(a.texto_norm), a.codigo]);
}

export async function fetchUsos(): Promise<Uso[]> {
  const { data, error } = await supabase.rpc("material_usos" as never);
  if (error) throw error;
  return (data ?? []) as Uso[];
}
```

(Revisar la ruta real del cliente supabase con `grep -rn "export const supabase" lib`. Los tipos de `types/supabase.ts` no conocen las tablas nuevas, así que hay que castear lo justo o regenerar los tipos con MCP `generate_typescript_types` si el repo lo acostumbra.)

- [ ] **Step 3: `features/materiales/hooks.ts`**

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../hooks/use-workspace";
import { ELECTRILAM_WORKSPACE_ID } from "../../constants";
import { fetchAlias, fetchCatalogo, fetchUsos } from "./api";
import type { Uso } from "../../lib/materiales-busqueda";

/** Datos del picker. staleTime Infinity: solo se refrescan al volver a la app
 * (refetchOnWindowFocus → AppState, como los catálogos paginados). */
export function useMateriales() {
  const { data: ws } = useWorkspace();
  const wsId = ws?.workspace_id ?? "";
  const activo = wsId === ELECTRILAM_WORKSPACE_ID;
  const opts = { enabled: activo, staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: "always" as const };
  const cat = useQuery({ queryKey: ["materiales", "catalogo", wsId], queryFn: () => fetchCatalogo(wsId), ...opts });
  const ali = useQuery({ queryKey: ["materiales", "alias", wsId], queryFn: () => fetchAlias(wsId), ...opts });
  const uso = useQuery({ queryKey: ["materiales", "usos", wsId], queryFn: fetchUsos, ...opts });
  const alias = useMemo(() => new Map(ali.data ?? []), [ali.data]);
  const usos = useMemo(() => new Map<string, Uso>((uso.data ?? []).map((u) => [u.codigo, u])), [uso.data]);
  return { catalogo: cat.data ?? [], alias, usos, listo: cat.isSuccess, activo };
}
```

Antes de esto, buscar cómo `features` hace el "refresh on app return" de los catálogos paginados (`grep -rn "staleTime: Infinity" features`) y copiar ese mecanismo si no es `refetchOnWindowFocus`. Para que sobreviva sin red entre aperturas de la app, confirmar si el QueryClient se persiste a disco (`grep -rn "persistQueryClient\|PersistQueryClient" app lib`). Si no se persiste, el picker sin señal solo funciona si se abrió con señal en esa sesión. Anotarlo en el reporte; no agregar persistencia nueva sin preguntar.

- [ ] **Step 4: `npx tsc --noEmit` sin errores nuevos. Commit.**

```bash
git add lib/materiales-busqueda.ts lib/cobros-diccionario.ts tests/materiales-busqueda.test.ts vitest.config.ts features/materiales
git commit -m "feat(materiales): búsqueda compartida y datos offline del picker"
```

---

### Task 9: Mobile — plantilla con Código

**Files:**
- Modify: `features/hojas/tipos.ts` (agregar `columnasDeTipo`)
- Modify: `features/hojas/api.ts` (`createHoja`, línea ~123: `HOJA_TEMPLATES[tipo]?.columnas` → `columnasDeTipo(tipo, workspaceId)`)
- Test: `tests/hoja-tipos.test.ts` (ya existe)

**Interfaces:**
- Produces: `export function columnasDeTipo(tipo: HojaTipo, workspaceId: string): HojaColumna[]` con ids fijos `codigo_usado` / `codigo_solicitado`.

- [ ] **Step 1: Test** (agregar a `tests/hoja-tipos.test.ts`)

```ts
import { columnasDeTipo } from "../features/hojas/tipos";
const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";
describe("columnasDeTipo", () => {
  it("Electrilam: Código justo después de Material", () => {
    expect(columnasDeTipo("materiales_usados", ELECTRILAM).map((c) => c.id)).toEqual(["material_usado", "codigo_usado", "cantidad_usada", "unidad_usada"]);
    expect(columnasDeTipo("materiales_solicitados", ELECTRILAM)[1]).toEqual({ id: "codigo_solicitado", label: "Código", tipo: "texto" });
  });
  it("otros workspaces: plantilla de siempre", () => {
    expect(columnasDeTipo("materiales_usados", "otro").map((c) => c.id)).toEqual(["material_usado", "cantidad_usada", "unidad_usada"]);
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/hoja-tipos.test.ts`

- [ ] **Step 3: Implementar en `tipos.ts`** (sin importar React Native: el archivo es puro)

```ts
const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7"; // = constants ELECTRILAM_WORKSPACE_ID (aquí sin imports de RN)
const CODIGO: Partial<Record<HojaTipo, HojaColumna>> = {
  materiales_usados: { id: "codigo_usado", label: "Código", tipo: "texto" },
  materiales_solicitados: { id: "codigo_solicitado", label: "Código", tipo: "texto" },
};

/** Columnas con que nace una hoja. En Electrilam, las de materiales llevan
 * Código al lado de Material: la llena el picker, nunca el teclado. */
export function columnasDeTipo(tipo: HojaTipo, workspaceId: string): HojaColumna[] {
  const base = HOJA_TEMPLATES[tipo].columnas.map((c) => ({ ...c }));
  const cod = CODIGO[tipo];
  return workspaceId === ELECTRILAM && cod ? [base[0], { ...cod }, ...base.slice(1)] : base;
}
```

Agregar `codigo_usado` y `codigo_solicitado` al set `deTipos` de `columnasParaTipo`: si no, cambiar el tipo de una hoja deja la columna Código duplicada como si fuera "agregada a mano".

En `api.ts createHoja`: `const columnas = (HOJA_TEMPLATES[tipo] ? columnasDeTipo(tipo, workspaceId) : DEFAULT_COLUMNAS).map((c) => ({ ...c }));`

- [ ] **Step 4: PASS + `npx tsc --noEmit`. Commit.**

```bash
git add features/hojas/tipos.ts features/hojas/api.ts tests/hoja-tipos.test.ts
git commit -m "feat(materiales): columna Código en hojas de materiales de Electrilam"
```

---

### Task 10: Mobile — sheet del picker

**Files:**
- Create: `lib/material-store.ts`
- Create: `app/(stack)/orden/material.tsx`
- Modify: `app/(stack)/_layout.tsx` (registrar la ruta junto a `orden/hoja-celda`, línea ~122)

**Interfaces:**
- Produces:
  ```ts
  // lib/material-store.ts
  export type MaterialAbierto = { texto: string; onElegir: (m: Material) => void; onNoListado: (texto: string) => void };
  export function setMaterialAbierto(m: MaterialAbierto | null): void
  export function getMaterialAbierto(): MaterialAbierto | null
  ```

- [ ] **Step 1: `lib/material-store.ts`** (mismo patrón que `lib/hoja-celda-store.ts`)

```ts
/**
 * Puente entre la hoja de cálculo y el picker de materiales (orden/material).
 * La sheet es otra ruta del stack y router.back() no devuelve valores: como en
 * lib/hoja-celda-store, la hoja deja aquí qué hacer al elegir antes de abrirla.
 */
import type { Material } from "./materiales-busqueda";

export type MaterialAbierto = {
  /** Lo que ya tenía la celda: arranca escrito en el buscador. */
  texto: string;
  onElegir: (m: Material) => void;
  onNoListado: (texto: string) => void;
};

let _abierto: MaterialAbierto | null = null;
export function setMaterialAbierto(m: MaterialAbierto | null) { _abierto = m; }
export function getMaterialAbierto(): MaterialAbierto | null { return _abierto; }
```

- [ ] **Step 2: `app/(stack)/orden/material.tsx`**

Leer completos `app/(stack)/orden/hoja-celda.tsx` y su `Stack.Screen` en `_layout.tsx` (header nativo con ✕, `AndroidSheetCard` en Android, `useColors()`, `AppText`/estilos HIG de CLAUDE.md §14). La sheet nueva usa la misma estructura:

```tsx
// Picker de materiales (Electrilam): buscador + chips de categoría + lista
// ordenada por lo que más usa este maestro. Sin texto: "Tus más usados".
// "No encontré…" anota la fila como no listado (Material con texto, Código vacío).
import { useMemo, useState } from "react";
import { FlatList, Platform, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useColors } from "../../../hooks/use-theme";
import { useMateriales } from "../../../features/materiales/hooks";
import { buscarEnCatalogo, type Material } from "../../../lib/materiales-busqueda";
import { getMaterialAbierto } from "../../../lib/material-store";

export default function MaterialSheet() {
  const colors = useColors();
  const router = useRouter();
  const abierto = getMaterialAbierto();
  const { catalogo, alias, usos, listo } = useMateriales();
  const [texto, setTexto] = useState(abierto?.texto ?? "");
  const [categoria, setCategoria] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(catalogo.map((m) => m.clasificacion).filter(Boolean))].sort(), [catalogo]);
  const resultados = useMemo(
    () => buscarEnCatalogo({ texto, categoria, catalogo, alias, usos }),
    [texto, categoria, catalogo, alias, usos],
  );
  const elegir = (m: Material) => { abierto?.onElegir(m); router.back(); };
  const noListado = () => { abierto?.onNoListado(texto.trim()); router.back(); };
  // Layout:
  //  - TextInput autoFocus (placeholder "Buscar material o código"), clearButtonMode
  //  - ScrollView horizontal de chips (categorias), el activo relleno con colors.tint; tocar el activo lo suelta
  //  - Título de sección: texto vacío → "Tus más usados"; si no → nada
  //  - FlatList(resultados): fila = descripción (AppText body) + código (monospace, secundario); onPress elegir
  //  - Footer, si texto.trim(): fila "No encontré «texto» → anotar como no listado" (onPress noListado)
  //  - !listo → "Cargando catálogo…"; listo && catálogo vacío → "Sin catálogo (necesitas señal la primera vez)"
  // ...
}
```

Escribir el JSX completo siguiendo `hoja-celda.tsx`. Ojo con la gotcha conocida: un ScrollView dentro de un formSheet rompe el layout en iOS. Usar `FlatList` como único scroll vertical, con los chips en su `ListHeaderComponent` (los chips son scroll horizontal, eso sí funciona), y probar en el simulador.

- [ ] **Step 3: Registrar la ruta** en `_layout.tsx`, al lado de `orden/hoja-celda`:

```tsx
<Stack.Screen name="orden/material" options={OPCIONES_SHEET_MATERIAL} />
```

con `OPCIONES_SHEET_MATERIAL` definido a partir de `OPCIONES_SHEET_CELDA` (leerlo), pero con `sheetAllowedDetents: [0.9]`, porque necesita espacio para el teclado y la lista, y `title: "Material"`.

- [ ] **Step 4: `npx tsc --noEmit`. Commit.**

```bash
git add lib/material-store.ts "app/(stack)/orden/material.tsx" "app/(stack)/_layout.tsx"
git commit -m "feat(materiales): sheet nativa del picker de materiales"
```

---

### Task 11: Mobile — la hoja abre el picker en Material/Código

**Files:**
- Modify: `components/HojaSpreadsheet.tsx` (`abrirTeclado` ~702, `cambiarCeldas` ~486)

**Interfaces:**
- Consumes: `columnasMaterial`, `setMaterialAbierto`, `useMateriales().activo`, `cambiarCeldas(f, celdas)`.

`abrirTeclado` es el único punto por el que pasan todas las formas de abrir el teclado: el segundo toque (~1241), ⌨, la acción "teclado" de ⚡ y `select(..., abrir)`. Interceptarlo ahí cubre todos los casos.

- [ ] **Step 1: Implementar**

Cerca de los otros `useMemo` del componente:

```tsx
const { activo: materialesActivos } = useMateriales();
// Hojas de Electrilam con Material + Código: esas celdas se llenan con el picker.
const colsMat = useMemo(() => (materialesActivos ? columnasMaterial(cols) : null), [materialesActivos, cols]);
```

Al inicio de `abrirTeclado` (sel.row 0 = nombres de columna; la fila de datos es `filas[row - 1]`. Confirmarlo leyendo `valueAt`):

```tsx
const cur = selRef.current;
const col = cur ? colsRef.current[cur.col] : undefined;
if (colsMat && cur && cur.row > 0 && col && (col.id === colsMat.material || col.id === colsMat.codigo)) {
  const fila = filas[cur.row - 1];
  if (!fila) return;
  Keyboard.dismiss();
  setMaterialAbierto({
    texto: fila.celdas[colsMat.material] ?? "",
    onElegir: (m) => cambiarCeldas(fila, { ...fila.celdas, [colsMat.material]: m.descripcion, [colsMat.codigo]: m.codigo }),
    onNoListado: (t) => cambiarCeldas(fila, { ...fila.celdas, [colsMat.material]: t, [colsMat.codigo]: "" }),
  });
  router.push("/(stack)/orden/material" as never);
  return;
}
```

Agregar `colsMat`, `filas`, `cambiarCeldas` y `router` a las deps del `useCallback`. Si `abrirTeclado` está declarado antes que `cambiarCeldas`, mover la intercepción a un callback nuevo `abrirEdicion` que se use en los cuatro lugares (`grep -n "abrirTeclado(" components/HojaSpreadsheet.tsx`). No reordenar hooks a ciegas.

Cortar, pegar y borrar desde ⚡ en esas celdas siguen funcionando: no pasan por `abrirTeclado`. Lo pegado en Código no se valida en mobile: un código inventado igual cae en la bandeja de Claudio, porque el export lo usaría tal cual. Aceptado en esta versión; documentarlo en el reporte.

- [ ] **Step 2: Probar en el simulador iOS + un Android**

`npx expo start` con el dev client (pedirle al usuario el dispositivo o simulador). En una OT de prueba de Electrilam, crear "Materiales usados" y verificar:
(a) nace con Código;
(b) doble toque en Material abre el picker con "Tus más usados";
(c) "tablero" ordena según la semilla del usuario logueado;
(d) elegir llena las dos celdas y ↶ (deshacer) las devuelve;
(e) "No encontré…" deja Código vacío;
(f) en una hoja "general" la celda abre el teclado normal;
(g) en modo avión, con el catálogo ya cargado, la búsqueda funciona.

- [ ] **Step 3: Commit**

```bash
git add components/HojaSpreadsheet.tsx
git commit -m "feat(materiales): Material y Código abren el picker en la hoja"
```

---

### Task 12: Mobile — "¿Usaste todo lo solicitado?" al cerrar

**Files:**
- Modify: `app/(stack)/orden/[id].tsx` (`handleCompletar` ~1120, después del bloque `requiere_hoja` ~1136-1142)
- Modify: `features/hojas/api.ts` (`copiarSolicitadosAUsados`)

**Interfaces:**
- Consumes: `checkHojaFilas()` → `{ hojaBlockReason: "usados" | "solicitados" | null }`, `getHojasForOrden`, `createHoja`, `createFila`, `updateFila`, `fetchFilas`, `columnasDeTipo`.
- Produces: `export async function copiarSolicitadosAUsados(workspaceId: string, userId: string, ordenId: string): Promise<Hoja>`.

- [ ] **Step 1: Test de la copia de celdas** (función pura en `features/hojas/tipos.ts`)

```ts
import { celdasSolicitadoAUsado } from "../features/hojas/tipos";
it("mapea ids de solicitados a usados y descarta la observación", () => {
  expect(celdasSolicitadoAUsado({ material_solicitado: "Tablero 12", codigo_solicitado: "tab12", cantidad_solicitada: "1", unidad_solicitada: "un", observacion_solicitud: "urgente" }))
    .toEqual({ material_usado: "Tablero 12", codigo_usado: "tab12", cantidad_usada: "1", unidad_usada: "un" });
});
```

- [ ] **Step 2: FAIL**, después implementar en `tipos.ts`:

```ts
const SOLICITADO_A_USADO: Record<string, string> = {
  material_solicitado: "material_usado", codigo_solicitado: "codigo_usado",
  cantidad_solicitada: "cantidad_usada", unidad_solicitada: "unidad_usada",
};
/** Fila de solicitud → fila de usados (lo que no tiene par, como la observación, no pasa). */
export function celdasSolicitadoAUsado(celdas: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(celdas).flatMap(([k, v]) => (SOLICITADO_A_USADO[k] ? [[SOLICITADO_A_USADO[k], v]] : [])));
}
```

→ PASS.

Esto solo sirve para hojas creadas en mobile, con ids fijos. Si la hoja de solicitados se creó en la web (ids aleatorios), mapear por label con `columnasMaterial` + la columna de label "Cantidad"/"Unidad". Implementarlo dentro de `copiarSolicitadosAUsados` como respaldo cuando `celdasSolicitadoAUsado` devuelve `{}` para una fila con datos.

- [ ] **Step 3: `copiarSolicitadosAUsados` en `features/hojas/api.ts`**

```ts
/** Cierre con solo solicitados: crea la hoja de usados con lo solicitado. */
export async function copiarSolicitadosAUsados(workspaceId: string, userId: string, ordenId: string): Promise<Hoja> {
  const hojas = await getHojasForOrden(workspaceId, ordenId);
  const usados = await createHoja(workspaceId, HOJA_TEMPLATES.materiales_usados.nombre, userId, ordenId, null, "materiales_usados");
  let orden = 0;
  for (const h of hojas.filter((x) => x.tipo === "materiales_solicitados")) {
    for (const f of await getFilasForHoja(h.id)) {
      const celdas = celdasSolicitadoAUsado(f.celdas ?? {});
      if (!Object.values(celdas).some((v) => (v ?? "").trim())) continue;
      const nueva = await createFila(usados.id, workspaceId, orden++);
      await updateFila(nueva.id, celdas);
    }
  }
  return usados;
}
```

(Usar las mismas funciones de lectura local que `checkHojaFilas`: `getHojasForOrden` y `getFilasForHoja`, que leen del cache SQLite y ven lo pendiente de sincronizar. Importarlas de donde las importa `[id].tsx`.)

- [ ] **Step 4: Preguntar en `handleCompletar`**

Justo después del bloque `if (orden?.requiere_hoja) {…}`:

```tsx
if (workspace?.workspace_id === ELECTRILAM_WORKSPACE_ID) {
  const estado = await checkHojaFilas();
  if (estado?.hojaBlockReason === "usados") {
    const respuesta = await new Promise<"todo" | "cambio" | null>((resolve) =>
      Alert.alert("¿Usaste todo lo solicitado?", "No hay hoja de materiales usados en esta OT.", [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
        { text: "Cambió algo", onPress: () => resolve("cambio") },
        { text: "Sí, todo", style: "default", onPress: () => resolve("todo") },
      ], { cancelable: true, onDismiss: () => resolve(null) }));
    if (!respuesta) return;
    const usados = await copiarSolicitadosAUsados(workspace.workspace_id, myId!, id);
    void qc.invalidateQueries({ queryKey: ["hojas"] });
    if (respuesta === "cambio") {
      router.push({ pathname: "/(stack)/orden/hoja", params: { ordenId: id, hojaId: usados.id } } as never);
      return;
    }
  }
}
```

Antes de pegarlo, confirmar en el archivo: los nombres reales de `workspace`, `myId` y `qc`; la query key de hojas (en `features/hojas/hooks.ts`, `HOJAS_KEY`, usar esa); y los params que recibe `orden/hoja` (leer `app/(stack)/orden/hoja.tsx`). Agregar las deps nuevas al `useCallback` (la lista está en la línea ~1247).

- [ ] **Step 5: Probar en el dispositivo**

OT de prueba de Electrilam con solicitados llenos y sin usados:
- "Sí, todo" crea la hoja de usados con las filas y continúa al cierre.
- "Cambió algo" abre la hoja nueva y no cierra.
- "Cancelar" no hace nada.
- Una OT con usados llenos no pregunta.

- [ ] **Step 6: `npx tsc --noEmit` + `npx vitest run tests/hoja-tipos.test.ts`. Commit.**

```bash
git add "app/(stack)/orden/[id].tsx" features/hojas/api.ts features/hojas/tipos.ts tests/hoja-tipos.test.ts
git commit -m "feat(materiales): al cerrar con solo solicitados, preguntar si se usó todo"
```

---

### Task 13: Salida

- [ ] **Step 1:** La migración ya está aplicada (Task 1) y la semilla cargada (Task 7).
- [ ] **Step 2:** Web: `npx tsc --noEmit` + `npx vitest run tests/lib/materiales-busqueda.test.ts tests/lib/hojas-plantilla.test.ts tests/lib/cobros-excel.test.ts tests/lib/semilla-usos.test.ts tests/lib/cobros-diccionario.test.ts`. Push de `feat/materiales-picker` y PR. **Merge y deploy los decide el usuario.**
- [ ] **Step 3:** Mobile: `npx tsc --noEmit` + `npx vitest run`. Push de `feat/materiales-picker` (basada en `fix/fotos-perdidas`). **El OTA lo publica el usuario**, desde esta rama, ios y android por separado, después de confirmar con `eas update:view` que la base sigue siendo la de prod.
- [ ] **Step 4:** Verificar que `lib/materiales-busqueda.ts` y `lib/cobros-diccionario.ts` son idénticos en los dos repos: `diff /c/dev/pangui/lib/materiales-busqueda.ts /c/dev/pangui-native-sdk57/lib/materiales-busqueda.ts` (y lo mismo para el diccionario) → sin salida.
- [ ] **Step 5:** Actualizar la memoria `project_pangui_cobros_electrilam` (o crear `project_pangui_materiales_picker`) con lo que quedó en prod.
