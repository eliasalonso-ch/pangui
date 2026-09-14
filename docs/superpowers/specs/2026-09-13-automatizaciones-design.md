# Automatizaciones — diseño

Fecha: 2026-09-13
Estado: aprobado para plan de implementación
Alcance: web (`pangui`) + retirada de umbrales manuales en móvil (`pangui-native-stable`)

## El problema

Hoy un medidor puede abrir una OT sola, pero la regla está soldada en el código.
`fn_medidor_lectura_critica` implementa exactamente dos reglas, sin
configuración:

1. `lectura >= medidores.critico` → OT de emergencia, prioridad alta.
2. `lectura - ultimo_disparo_ot >= intervalo_ot` → OT preventiva, prioridad media.

El título, el tipo, la prioridad, el responsable y el dedupe son constantes en
la función. Un cliente que quiera "si la corriente pasa de 10 A entre las 22:00
y las 00:00, abre una OT asignada a Juan con este procedimiento" no tiene dónde
escribirlo.

Esta funcionalidad **generaliza el motor que ya existe**. No se agrega un
segundo mecanismo al lado: el trigger actual se reemplaza.

## Qué se construye

Un motor regla → condición → acción sobre lecturas de medidor, con UI propia en
`/automatizaciones`, disponible solo en plan Empresa.

Referencia de comportamiento: MaintainX Automations (help.getmaintainx.com).
Se copia el modelo y el vocabulario de la UI; no el modelo de planes.

### Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Coexiste con los umbrales soldados? | No. Se reemplaza el trigger entero. |
| ¿Qué acciones en v1? | Solo `crear_ot`. El enum acepta las otras tres; la UI no las ofrece. |
| ¿Pro conserva el disparo por `critico`? | No. Todo disparo medidor → OT pasa a ser Empresa. |
| ¿Plantillas de OT? | No. Solo "crear desde cero". |
| ¿Umbrales en el medidor manual? | Se retiran del formulario. Siguen para `automatizado`. |

## Modelo de datos

Cuatro tablas nuevas. Todas con `workspace_id` y RLS por `my_workspace_id()`,
igual que `medidores`.

### `automatizaciones`

```
id                  uuid pk
workspace_id        uuid not null → workspaces
nombre              text not null, no vacío
descripcion         text
activa              boolean not null default true
ultima_ejecucion_at timestamptz
creado_por          uuid → usuarios
created_at          timestamptz not null default now()
```

`activa` es el toggle "Habilitar la automatización" de la ficha. Se apaga sin
borrar, porque una automatización apagada conserva su historial.

### `automatizacion_triggers`

Una fila por medidor vigilado. Varios medidores en la misma automatización =
varias filas (el "+ Añadir varios activos" de la UI).

```
id                uuid pk
automatizacion_id uuid not null → automatizaciones on delete cascade
medidor_id        uuid not null → medidores on delete cascade
operador          text not null  -- mayor_igual | menor_igual | igual | entre
valor             numeric not null
valor_hasta       numeric        -- solo cuando operador = 'entre'
modo              text not null default 'una_lectura'
                  -- una_lectura | una_lectura_reset | lecturas_multiples
modo_n            integer        -- solo cuando modo = 'lecturas_multiples'
armado            boolean not null default true
```

`modo` es el desplegable "Para" de la UI:

- `una_lectura` — dispara cada vez que una lectura cumple.
- `una_lectura_reset` — dispara una vez y no vuelve hasta que la condición deje
  de cumplirse. Es un latch, y por eso necesita `armado`: la única forma de
  saber "ya disparé y todavía no se despejó" es guardarlo. Se pone en `false` al
  disparar y vuelve a `true` en la primera lectura que no cumple.
- `lecturas_multiples` — dispara cuando las últimas `modo_n` lecturas cumplen
  todas. Se evalúa mirando hacia atrás en `medidor_lecturas`, sin estado propio.

`operador = 'entre'` es el único que usa `valor_hasta`; hay un CHECK que lo
exige y que lo prohíbe en el resto.

### `automatizacion_acciones`

```
id                       uuid pk
automatizacion_id        uuid not null → automatizaciones on delete cascade
tipo                     text not null
                         -- crear_ot | crear_solicitud | cambiar_estado_activo
                         -- | enviar_notificacion
config                   jsonb not null default '{}'
retrigger_minutos        integer not null default 5
solo_si_anterior_cerrada boolean not null default false
orden                    integer not null default 0
```

`config` es jsonb y no columnas porque la acción `crear_ot` lleva ~15 campos
(título, descripción, activo, ubicación, asignados, prioridad, tipo de trabajo,
tiempo estimado, categorías, procedimientos) y las otras tres llevan dos cada
una. Una tabla con columna por campo sería 90% NULL y habría que migrarla cada
vez que la OT gane un campo.

En v1 la UI solo escribe `tipo = 'crear_ot'`. El enum acepta las otras tres para
no migrar el CHECK después; el motor las ignora con un log `omitida`.

Los dos frenos, ambos por acción y no por automatización, igual que MaintainX:

- `retrigger_minutos` — no repetir esta acción antes de N minutos. Default 5.
  Es lo que impide que un gateway de 5 segundos genere 720 OT por hora.
- `solo_si_anterior_cerrada` — el checkbox "Crear sólo si el anterior Orden de
  Trabajo generado desde Automatización está cerrado". Es el dedupe que hoy está
  soldado en la función, ahora opcional.

### `automatizacion_ejecuciones`

```
id                uuid pk
automatizacion_id uuid not null → automatizaciones on delete cascade
accion_id         uuid → automatizacion_acciones on delete set null
lectura_id        uuid → medidor_lecturas on delete set null
resultado         text not null  -- ejecutada | omitida | fallida
detalle           text           -- por qué se omitió o falló
orden_id          uuid → ordenes_trabajo on delete set null
created_at        timestamptz not null default now()
```

Es el panel "Historia de la acción" y es parte del producto, no telemetría. La
FAQ de MaintainX son cinco preguntas y cuatro son "¿por qué no corrió / por qué
se saltó / por qué falló / por qué duplicó?". Sin registrar también las
omisiones, esas preguntas no se pueden contestar y se vuelven soporte.

Se escribe una fila por acción evaluada, incluidas las omitidas.

## El motor

Un solo trigger `AFTER INSERT ON medidor_lecturas`, `SECURITY DEFINER`, que
reemplaza a `fn_medidor_lectura_critica`.

**Por qué en la base y no en la app:** una lectura entra por tres caminos —el
formulario web, la cola offline del móvil y `/api/medidores/lecturas` con
service role— y las tres tienen que disparar igual. Es el mismo motivo que está
comentado en la migración original, y sigue valiendo.

Flujo por cada lectura insertada:

1. Buscar triggers activos de ese medidor cuya automatización esté `activa`.
2. Evaluar el operador contra `NEW.valor`.
3. Evaluar `modo` (latch de `armado`, o las últimas N lecturas).
4. Por cada acción de la automatización, en orden:
   - si hay una ejecución `ejecutada` de esa acción hace menos de
     `retrigger_minutos` → fila `omitida`, motivo "retrigger";
   - si `solo_si_anterior_cerrada` y existe OT abierta de esa automatización →
     fila `omitida`, motivo "OT anterior abierta";
   - si no, ejecutar y registrar `ejecutada` con el `orden_id`.
5. Actualizar `ultima_ejecucion_at`.

La inserción de la OT reutiliza la lógica que ya está en la función actual:
`MAX(numero)+1` por workspace, `origen = 'medidor'`, `medidor_id` seteado. No se
puede llamar a `create_work_order_v1`: es una RPC pensada para un cliente con
JWT de actor, y acá no hay actor. La OT queda a nombre de
`automatizaciones.creado_por`, que es lo más cercano a un responsable que se
puede afirmar.

`ordenes_trabajo` gana `automatizacion_id uuid` para que
`solo_si_anterior_cerrada` pueda mirar por automatización y no por medidor
(dos automatizaciones sobre el mismo medidor no deben bloquearse entre sí).

## Gate de plan

Bandera nueva `automatizaciones: boolean` en `lib/flow-plans.ts`, `true` solo en
`enterprise`. Se propaga sola a `plan_features` (la ruta
`/api/suscripcion/status` devuelve `plan.features` completo) y de ahí al
sidebar.

Tres capas, como el resto de las secciones de pago:

1. Sidebar: el item no se muestra (`isAdmin && hasAutomatizaciones`).
2. Ruta: `UpgradePrompt variant="card"`, igual que `/medidores`.
3. Motor: el trigger verifica el plan del workspace antes de ejecutar. Sin esto,
   una automatización creada durante el trial seguiría corriendo después.
   La consulta es directa —`subscriptions(workspace_id, plan_key, status)`— y
   exige `plan_key = 'enterprise'` con `status` vigente. El trial NO habilita el
   motor: `effectivePlan()` mapea trial a Pro, no a Empresa, así que un trial
   puede ver la sección solo si algún día se decide mostrarla, pero no disparar.
   Cuando el plan no alcanza se registra una fila `omitida` con motivo "plan",
   para que la ficha explique por qué dejó de correr en vez de quedar muda.

**Consecuencia asumida:** el disparo medidor → OT deja de existir en Pro. El
highlight "Medidores y mantenimiento por condición" de Pro pasa a decir solo
"Medidores y seguimiento de condición", y Empresa suma "Automatizaciones". Los
medidores (gráfico, historial, rondas, y los umbrales de color en automatizados)
siguen en Pro.

## Retirada de umbrales del medidor manual

Los umbrales pasan a ser exclusivos del tipo `automatizado`. En un medidor
`manual` la vigilancia se configura como automatización.

- Web `components/medidores/MedidorCrearPanel.tsx`: la sección de umbrales
  (`advertencia`, `critico`, `intervalo_ot`) se muestra solo si
  `tipo === 'automatizado'`.
- Móvil `app/(stack)/medidor/form.tsx`: lo mismo, más el texto de pie que hoy
  dice "Una lectura sobre la alarma abre una OT de emergencia sola" — que deja
  de ser cierto.
- Las columnas se quedan en la tabla: los automatizados las usan **para pintar**,
  no para disparar. Al retirarse `fn_medidor_lectura_critica` ya nada abre una OT
  desde `critico`; lo único que siguen alimentando es `nivelDeLectura()`, que
  colorea la lectura en el gráfico y en la lista. El texto de ayuda del
  formulario tiene que decir eso y no lo que promete hoy.
- Una migración limpia `advertencia`, `critico` e `intervalo_ot` en las filas
  `tipo = 'manual'` existentes (hoy: un medidor, "Temperatura carcasa").

`nivelDeLectura()` y el coloreado por nivel siguen funcionando en automatizados;
en manuales devuelven `normal` siempre, que es lo correcto una vez que no hay
umbral.

## UI

### `/automatizaciones`

Master-detail calcado de `/medidores`: lista de 380px redimensionable a la
izquierda con `localStorage`, detalle a la derecha, `useDeepLinkId` para que la
URL apunte a una automatización. No inventa layout.

Lista: nombre, estado (Activada / Pausada) y última ejecución.
Filtros: por estado, por activo, por medidor.

Ficha: toggle "Habilitar la automatización", bloque Activador, bloque Acción,
y "Historia de la acción" abajo — cada fila con fecha, valor que disparó y
enlace a la OT generada.

Icono: `Workflow` de lucide-react. Item de sidebar bajo Medidores, con gate
`isAdmin`, porque configurar automatizaciones es configuración del espacio y no
trabajo del día a día (mismo criterio que Planes de mantención).

### El constructor

Un panel con las tres secciones de la referencia: Activador, Condiciones,
Acciones.

Reutiliza `FieldRow`, `inputStyle`, `textareaStyle` y `focoInput` de
`components/catalogo/PanelCatalogo.tsx`.

**No** reutiliza `OTCrearPanel.tsx`. Ese archivo tiene 2384 líneas y está soldado
a la creación en vivo: borradores con autosave, escaneo con IA, subida de fotos
a R2, aviso de duplicados, adjuntos. La acción de una automatización es una
*plantilla* — junta valores y los guarda en `config`, no crea nada en ese
momento. Enchufarlo obligaría a apagar la mitad del panel con banderas.

Lo que sí se comparte, extrayéndolo: `SearchSelect` y `AssigneeSelect`, que hoy
son locales de `OTCrearPanel` y son exactamente los controles que el formulario
de acción necesita. Salen a `components/ordenes/`.

Campos de la acción `crear_ot`, en el orden de la referencia: título,
descripción, ubicación, activo, procedimiento, asignar a, tiempo estimado,
prioridad, categorías. Sin fotos ni adjuntos: una plantilla que sube archivos no
tiene dónde ponerlos hasta que la OT existe.

## Qué no entra

- Acciones que no sean `crear_ot`. El enum las acepta; la UI no.
- Plantillas de OT ("Utilizar una plantilla"). No existe el concepto en Pangui.
- Disparadores que no sean lectura de medidor.
- Condiciones. La sección se muestra vacía; `automatizacion_triggers` ya alcanza
  para el caso real y las condiciones de MaintainX (estado del activo, franja
  horaria) no las pidió nadie todavía.
- Móvil. La UI es solo web; el motor corre en la base y por eso una lectura
  cargada desde el móvil dispara igual.
- Exportación masiva.

## Verificación

El motor es lógica no trivial con dinero real detrás (una automatización mal
frenada genera cientos de OT), así que lleva prueba:

`supabase/tests/automatizaciones.sql` — pgTAP o script asertivo, según lo que ya
use el repo. Casos mínimos:

1. Lectura que cumple → una OT, una fila `ejecutada`.
2. Segunda lectura dentro de `retrigger_minutos` → sin OT, fila `omitida`.
3. `solo_si_anterior_cerrada` con OT abierta → sin OT, fila `omitida`.
4. `una_lectura_reset`: dispara una vez, no repite, se rearma al despejarse.
5. Automatización `activa = false` → no dispara.
6. Workspace sin plan Empresa → no dispara.
7. Medidor manual sin umbrales → el trigger viejo ya no existe, no hay OT
   fantasma.

## Orden de implementación

1. Migración: tablas, RLS, `ordenes_trabajo.automatizacion_id`, bandera de plan.
2. Migración: motor nuevo, `DROP` del trigger viejo, limpieza de umbrales
   manuales.
3. Prueba SQL del motor.
4. `lib/automatizaciones-api.ts`.
5. Extracción de `SearchSelect` / `AssigneeSelect`.
6. Ruta `/automatizaciones` + constructor + historial.
7. Sidebar, gate y copy de precios.
8. Umbrales condicionados por tipo en web y móvil.
