# Materiales desde catálogo en las hojas (Electrilam)

Fecha: 2026-11-10 · Estado: aprobado (usuario + dueño de Electrilam)
Repos: `pangui` (web, DB, export) y `pangui-native-sdk57` (mobile)

## Problema

Los maestros de Electrilam escriben los materiales como texto libre en las hojas
de la OT ("chuky", "automático 10"). Claudio después los traduce a mano a los
códigos de Patricio para cobrar. Hay que obligarlos a elegir del catálogo sin que
eso signifique (a) que dejen de anotar lo que no encuentran ni (b) que creen
materiales duplicados.

Además, en los últimos 90 días 15 de las 27 OTs con hoja de solicitados se
cerraron **sin** hoja de usados, y el export de cobros salta las de solicitados
(`lib/cobros-excel.ts`, "lo pedido no es lo usado"): esos materiales no llegan al
Excel.

## Decisiones

1. **Catálogo cerrado con salida controlada.** La celda Material se llena con un
   picker. Si el material no está, "No lo encuentro" anota la fila como **no
   listado** (texto libre, sin código). El maestro nunca crea códigos.
2. **Aplica a las dos hojas:** `materiales_usados` y `materiales_solicitados`.
3. **Orden personal + del equipo.** Primero lo que más usa ese maestro (con más
   peso a lo reciente), después lo que más usa el resto del workspace, al final
   alfabético. Un código escrito exacto gana siempre.
4. **Cierre con solo solicitados:** se pregunta "¿Usaste todo lo solicitado?".
   El export toma solicitados como respaldo cuando no hay hoja de usados.
5. Solo Electrilam (`ELECTRILAM_WORKSPACE_ID`, el gate de siempre). Los demás
   workspaces siguen con texto libre.

## 1. Datos

### Columnas de la hoja
Las plantillas `materiales_usados` y `materiales_solicitados` ganan una columna
**Código** con id fijo (`codigo_usado` / `codigo_solicitado`), **solo cuando la
hoja se crea en Electrilam** (web `createHoja` y mobile `useCreateHoja`).

- `Material` guarda la descripción oficial del catálogo → PDF, web y Excel se
  siguen leyendo como hoy.
- `Código` guarda el código (`itm1x10a`). La llena el picker, no el teclado.

### Pendiente = derivado, no guardado
Una fila es **pendiente** si su hoja tiene columna Código, Material no está vacío
y Código sí. Las hojas viejas no tienen columna Código, así que nunca cuentan
como pendientes: no hace falta fecha de corte ni flag.

### Tablas nuevas (una migración)
- `material_alias (workspace_id, texto_norm, codigo)`, único por
  `(workspace_id, texto_norm)`. Se escribe cuando Claudio resuelve un pendiente.
  RLS: select del workspace; insert/update solo owner/admin (`lib/roles`).
- `material_usos_semilla (workspace_id, usuario_id, codigo, veces, ultimo_uso)`:
  se llena **una sola vez** con el historial de texto libre pasado por el
  diccionario. No se vuelve a escribir. RLS: select del workspace.
- RPC `material_usos(p_workspace)` → `(codigo, mios, equipo, ultimo_mio)`:
  cuenta los códigos de la columna Código de las hojas (autor =
  `hojas_inventario.created_by`) + la semilla. Lo llama el picker al abrir, y
  el resultado se cachea.

`catalogo_materiales` no cambia de forma. Lo nuevo es que insert/update/delete
pasan a ser solo owner/admin (hoy cualquiera del workspace puede).

## 2. Búsqueda y orden (función pura compartida)

Archivo nuevo `lib/materiales-busqueda.ts`, **copiado igual** entre web y mobile
(mismo patrón que `hoja-formulas.ts`). También pasa a ser compartido
`lib/cobros-diccionario.ts`.

`buscar(texto, categoria, catalogo, alias, usos) → MaterialCatalogo[]`:
1. Candidatos: catálogo filtrado por categoría (`clasificacion`) si hay chip.
   Sin texto → los que tienen usos, ordenados por uso; si no hay usos, nada
   (el picker muestra las categorías).
2. Con texto (normalizado: minúsculas, sin tildes): calza código, descripción
   (todas las palabras como prefijo), alias exacto o `codigosDeTexto` del
   diccionario.
3. Orden: código exacto → `puntaje = mios × decaimiento(ultimo_mio) +
   equipo × 0.1` desc → código asc. Decaimiento: media vida de 90 días.

Un test de vitest por repo (el mismo archivo) cubre: código exacto primero, lo
propio sobre lo del equipo, lo del equipo sobre lo no usado, alias, chip de
categoría.

## 3. Mobile (`pangui-native-sdk57`)

- **Datos offline:** catálogo (~1.500 filas), alias y `material_usos` en
  TanStack con `staleTime: Infinity` + refresco al volver a la app (igual que
  los catálogos paginados). La búsqueda corre en el teléfono y funciona sin
  señal.
- **Picker:** ruta formSheet nueva `orden/material`, con un callback bridge como
  `lib/hoja-celda-store`. Contiene el buscador (autoFocus), los chips de
  categoría, la lista ("Tus más usados" sin texto) y, después de buscar, la
  fila "No encontré «X» → anotar como no listado".
  - Al elegir: escribe Material = descripción y Código = código en la misma
    `updateFila`.
  - No listado: Material = texto escrito, Código = "".
- **HojaSpreadsheet:** en hojas con columna Código, tocar dos veces (o ⌨) una
  celda Material/Código abre el picker en vez de un teclado. Cortar, pegar y
  borrar en esas celdas siguen funcionando.
- **Cierre:** cuando `hojaBlockReason === "usados"` (hay solicitados con filas y
  no hay usados con filas), al tocar Completar aparece un alert: "¿Usaste todo
  lo solicitado?"
  - **Sí, todo** → copia la hoja de solicitados a una nueva `materiales_usados`
    (`planHojaCopy` + ids de columna mapeados a los del tipo usados) y sigue
    con el cierre.
  - **Cambió algo** → hace la misma copia y abre la hoja nueva. El cierre se
    corta.
  - **Cancelar.**
  Solo en Electrilam. No reemplaza el bloqueo actual de `requiere_hoja`.

## 4. Web (`pangui`)

- **Celda Material en `components/HojaSpreadsheet.tsx`:** en hojas con columna
  Código, al editar se abre un combobox con la misma `buscar()` (catálogo, alias
  y usos cargados una vez por TanStack). Elegir escribe las dos celdas; Enter
  con texto sin match = no listado.
- **Bandeja de pendientes:** página nueva solo para owner/admin de Electrilam,
  enlazada desde el botón Cobros. Muestra una fila por pendiente: OT, maestro,
  fecha, texto, cantidad. Hay dos acciones:
  - **Elegir código** (combobox del catálogo): escribe Material/Código en la
    fila y hace upsert de `material_alias(texto_norm → código)`.
  - **Crear código:** inserta en `catalogo_materiales` (código, descripción,
    unidad, clasificación) y después hace lo mismo que la anterior.

## 5. Export de cobros (`lib/cobros-excel.ts`)

- Si la fila trae Código, se usa directo (como hoy en las hojas tipo `cobro`).
  Sin código → el flujo actual (exacto → alias → diccionario).
- Si la OT no tiene ninguna hoja `materiales_usados`/`cobro` con filas, se
  procesan sus hojas de solicitados con la nota "(según solicitud)".

## Fuera de alcance

- Otros workspaces. Un editor completo del catálogo (Patricio sigue siendo la
  fuente). Precios (nunca en Pangui).
- Aprender alias automáticamente de las correcciones de Claudio en el Excel
  (fase 2 de cobros).

## Orden de salida

1. Migración (tablas + RLS + RPC + semilla) vía MCP `apply_migration`, nunca
   `db push`.
2. Web: bandeja + combobox + export → deploy.
3. Mobile por OTA. **Ojo:** el canal de producción sale de
   `fix/fotos-perdidas` (bf0f56f), no de master. El OTA se publica desde esa
   rama o desde una que la contenga, para ios y android por separado.

## Riesgos

- **Semilla mala → orden raro el primer día:** el diccionario acierta ~82%. Peor
  caso: un material mal puesto arriba, que se corrige solo con el uso.
- **Abuso de "no listado":** se ve en la bandeja (pendientes por maestro). Hoy
  no se automatiza nada.
- **Hojas abiertas de antes del deploy** no tienen columna Código: siguen
  con texto libre hasta que se cierre la OT. Aceptado.
