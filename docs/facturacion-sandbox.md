# Facturación SpA + pruebas en sandbox de Flow

Guía operativa del cambio de boleta de honorarios a **factura electrónica afecta
a IVA**, y del plan de pruebas en sandbox antes de tocar producción.

## Qué cambió y por qué

Pangui facturaba como persona natural de segunda categoría, emitiendo **boleta
de honorarios electrónica (BHE)**. Con la SpA constituida eso deja de ser
válido: una sociedad de primera categoría **no puede emitir BHE**, debe emitir
factura electrónica afecta a IVA.

Esto no era solo un cambio de nombre. La app le prometía por escrito al cliente
un documento que la empresa no puede emitir, y afirmaba en
`/configuracion/suscripcion` que *"no dan derecho a crédito fiscal de IVA"* —
falso bajo el modelo nuevo.

### Decisión de precios: IVA por fuera (desde 2026-09-03)

Los precios del catálogo (`lib/flow-plans.ts`) son **netos**: el IVA se agrega
al momento del cobro y el cliente paga el bruto.

| Plan     | Neto (lista) | IVA    | Total a pagar |
|----------|--------------|--------|---------------|
| Basic    | $4.990       | $948   | $5.938        |
| Esencial | $6.990       | $1.328 | $8.318        |
| Pro      | $9.990       | $1.898 | $11.888       |

**Esto reemplaza la política anterior**, en que los mismos números eran brutos
y el IVA salía del margen (de $9.990 quedaban $8.395). El cambio se hizo al
contratar el primer cliente real: con IVA incluido, un plan de 10 usuarios a
$3.990 dejaba $33.529 en vez de los $39.900 de precio de lista.

Implicancia: **es una subida de precio para el cliente final** (~19%). Hay que
avisarle a cualquier cliente que haya contratado bajo la política anterior.

#### Dónde vive la regla

- `desglosarCobroSuscripcion(precioNeto, usuarios)` — usa `desglosarNeto`, no
  `desglosarBruto`. Es la única función que deben llamar los cobros.
- `montoParaFlow(precioNeto)` — **todo** monto que viaje a Flow pasa por acá.
  Flow cobra el `amount` tal cual y no sabe de IVA, así que tanto el `amount`
  de un plan (`seed-planes`) como el de cada item de usuario extra
  (`flow-sync`) tienen que ir en bruto. Si algún día se agrega otro lugar que
  mande montos a Flow, tiene que usar este helper.
- `textoDesglose(neto)` — recibe el neto y revela el total con IVA.

La regla de redondeo no cambió: el IVA sigue siendo una **resta** contra el
bruto redondeado, para que `neto + iva = total` siempre cuadre.

#### Los planes en Flow hay que resembrarlos

Los planes creados en Flow con la política anterior tienen el `amount` en neto.
Como Flow cobra ese valor tal cual, **seguirán cobrando sin IVA hasta que se
actualicen**. `seed-planes` ya emite el bruto, pero `/plans/create` no
sobrescribe un plan existente: hay que editarlos en el panel de Flow o crear
planes nuevos con otro `planId` y apuntar los `FLOW_PLAN_*` a ellos.

### La regla de redondeo (no la cambies)

`lib/tributario.ts` calcula:

```
neto = round(bruto / 1.19)
iva  = bruto - neto          ← la RESTA, nunca round(neto * 0.19)
```

Calcular el IVA por separado produce descuadres de $1 en ciertos montos, y una
factura donde `neto + iva ≠ total` es rechazada por el SII.
`tests/lib/tributario.test.ts` verifica el cuadre exhaustivamente de $1 a
$2.000.000, e incluye una contraprueba que demuestra que el cálculo ingenuo sí
falla. Si esa contraprueba empieza a pasar, alguien rompió algo.

El IVA se calcula **sobre el total del período**, no por usuario: desglosar cada
línea y sumar arrastra el error de redondeo una vez por usuario (con Basic y 10
usuarios ya son $3 de diferencia).

## Emisión: manual por el portal MIPYME

Hoy la emisión es manual. `lib/dte/emisor.ts` define la interfaz `EmisorDTE` y
la implementación `EmisorManual`, que **registra** el documento pero no lo
emite. Cuando la emisión manual deje de escalar, se agrega otra implementación
(SimpleFactura, LibreDTE, Nubox) sin tocar a los llamadores.

### Ciclo mensual

1. Correr el listado de pendientes:
   ```powershell
   cd C:\dev\pangui
   npx supabase db query --linked (Get-Content scripts/facturas-pendientes.sql -Raw)
   ```
   La primera consulta lista documentos ya registrados sin emitir. La segunda es
   la red de seguridad: períodos cobrados que ni siquiera tienen documento
   registrado (marca con `⚠` los datos que faltan en el perfil del cliente).

2. Emitir en sii.cl → Servicios online → Factura electrónica → Sistema de
   facturación gratuito del SII → Emitir factura electrónica.

3. Registrar el folio para cerrar el período:
   ```sql
   update documentos_tributarios
      set folio = <folio>, estado = 'emitido', emitido_at = now()
    where id = '<id>';
   ```

El índice único `uniq_doc_trib_periodo_suscripcion` impide facturar dos veces el
mismo período de la misma suscripción.

## Plan de pruebas en sandbox

> **Nada de esto debe correrse contra producción.** Al momento de escribir esto,
> `.env.local` tiene `FLOW_ENV=production` y el único proyecto Supabase enlazado
> es el de producción (`yqwsryjbmlvcghnwnzik`). No existe proyecto de staging.

### 1. Apuntar a sandbox

En `.env.local`:

```
FLOW_ENV=sandbox
FLOW_API_KEY=<api key de sandbox>
FLOW_SECRET_KEY=<secret key de sandbox>
```

Las credenciales de sandbox son distintas de las de producción y se sacan de
https://sandbox.flow.cl. `lib/flow.ts` conmuta la URL base según `FLOW_ENV`.

**Guarda antes una copia del `.env.local` de producción** — ya existen
`.env.local.bak` y `.env.local.prod-backup`, no los pises.

### 2. Sembrar los planes en sandbox

Los `FLOW_PLAN_*` de producción no existen en sandbox. Hay que volver a
sembrarlos con `/api/suscripcion/seed-planes` y copiar los IDs resultantes a
`.env.local`.

### 3. Aplicar la migración

`supabase/migrations/20260817120000_facturacion_spa_iva.sql` **no está
aplicada**. Es aditiva e idempotente (`IF NOT EXISTS` en todo), pero aplicarla
es una acción sobre la base y debe hacerse deliberadamente.

Tras aplicarla, regenerar tipos en ambos repos, según CLAUDE.md:

```powershell
npx supabase gen types typescript --project-id yqwsryjbmlvcghnwnzik > types/supabase.ts
```

### 4. Exponer el webhook

Flow necesita alcanzar `/api/suscripcion/webhook` por HTTPS. Con un túnel
(ngrok, cloudflared), configurar la URL en Flow Dashboard → Comercio →
Notificaciones, y poner el mismo host en `NEXT_PUBLIC_APP_URL`.

### 5. Casos a probar

| # | Caso | Qué verificar |
|---|------|---------------|
| 1 | Perfil de facturación incompleto | No deja elegir plan. Pide razón social, RUT, giro, dirección, región, comuna y ciudad |
| 2 | RUT inválido | Rechazado en cliente y servidor. Probar `12.345.678-9` (DV incorrecto) |
| 3 | RUT válido con K | `10.000.013-K` debe aceptarse |
| 4 | Contratar plan | Suscripción creada en Flow, fila local con `status` correcto |
| 5 | Pago del primer período | Webhook actualiza `subscriptions` y espeja `usuarios.plan` |
| 5b | **Documento registrado al pagar** | Aparece una fila en `documentos_tributarios` en estado `pendiente`, con `neto + iva = total` y los usuarios correctos |
| 5c | Trial e impago no facturan | Con `trialing` o `past_due` **no** se crea documento |
| 6 | **Webhook duplicado** | Reenviar la misma notificación: la segunda responde `{ok:true,duplicate:true}` y **no** inserta un segundo `subscription_events` ni un segundo documento |
| 7 | Renovación del mes siguiente | Sí se procesa (clave de idempotencia distinta por período) |
| 8 | Impago | `active → past_due`, se procesa aunque el período sea el mismo |
| 9 | Agregar usuario | `flow-sync` agrega un item; el total refleja usuarios × precio |
| 10 | Desglose en UI | El resumen muestra "neto + IVA" y cuadra con `lib/tributario.ts` |
| 11 | Cancelación | Baja a Basic al terminar el período |

### 6. Cargo automático (lo que destrabó la cuenta bancaria)

Hasta ahora el cobro era por **link de pago mensual**, no cargo automático:
`/customer/register` respondía `code 7001: "Commerce has not automatic charge
contract"` porque ese producto (el 148 de Flow) exige cuenta a nombre de un RUT
de primera categoría.

Con la SpA el requisito se cumple, pero **el contrato se habilita del lado de
Flow, no del código**. Por eso está tras un flag:

```
FLOW_CARGO_AUTOMATICO=true
```

Con el flag apagado, el comportamiento es exactamente el anterior (link de
pago). Con el flag encendido, `/api/suscripcion/register` llama a `registerCard`
y el usuario pasa por el formulario de tarjeta de Flow; el resto del flujo
(`register/callback` → `createSubscription` → webhook) ya existía y está
probado.

**Prueba decisiva:** encender el flag en sandbox e intentar contratar.
- Si el flujo lleva al formulario de tarjeta → el contrato está activo.
- Si el log muestra el aviso de 7001 → falta habilitar el producto 148 en el
  panel de Flow. El código cae solo al flujo de link de pago, así que el cliente
  igual puede contratar.

Sobre la cuenta **Global66 vista**: el requisito documentado hablaba de cuenta
corriente. Que el registro en Flow haya pasado sin trabas es buena señal, pero
el registro y la habilitación del cargo automático son validaciones distintas.
La prueba del punto anterior lo resuelve en un intento. Lo que sí importa es que
la cuenta esté a nombre del **RUT de la SpA**, no del personal.

### 7. Recién entonces, producción

Volver `FLOW_ENV=production` con las credenciales productivas, aplicar la
migración a producción y verificar con **un cobro real pequeño** antes de abrir
a todos los clientes.

## Registro automático del documento

Cuando el webhook confirma que un período quedó **pagado**, se registra solo el
documento tributario correspondiente (`lib/dte/registrar-periodo.ts`).

La regla de cuándo corresponde vive aislada en `lib/dte/periodo-facturable.ts`:

| Estado del webhook | ¿Genera documento? | Por qué |
|--------------------|--------------------|---------|
| `active`   | **Sí** | El período está pagado |
| `trialing` | No | El cliente todavía no ha pagado nada |
| `past_due` | No | El cobro falló; emitir obligaría a anular después |
| `unpaid` / `canceled` | No | Nada que facturar |

Detalles que importan:

- Los usuarios cobrados se cuentan con **los mismos criterios que
  `lib/flow-sync.ts`** usa para calcular el cargo (activos, no excluidos de
  facturación, no dados de baja). Si divergieran, la factura no cuadraría con
  lo que Flow cobró.
- Si el perfil de facturación está incompleto, **el documento se registra
  igual**: el cobro ya ocurrió y debe quedar rastro. Los campos faltantes se
  ven marcados con `⚠` en `facturas-pendientes.sql` antes de emitir.
- **Nunca lanza.** Un fallo al registrar no rompe el webhook ni impide que la
  suscripción se actualice; el período cae en la red de seguridad de
  `facturas-pendientes.sql`.

## UI

`/configuracion/suscripcion` muestra dos tablas separadas a propósito:

- **Cobros** (`InvoicesPanel`) — los movimientos de dinero en Flow.
- **Documentos tributarios** (`DocumentosPanel`) — las facturas ante el SII,
  con folio, desglose neto/IVA y estado.

Se mantienen aparte porque un período puede estar pagado y su factura todavía
pendiente de emisión; mezclarlos haría creer que falta un cobro cuando lo que
falta es emitir.

## Pendientes conocidos

- **Notas de crédito.** El tipo 61 está en el modelo pero no hay flujo para
  anular una factura ya emitida.
- **`tipo_receptor`.** La columna existe con default `'empresa'` y el backend la
  valida, pero el formulario todavía no la expone: no hay caso B2C aún.
- **Confirmar folio desde la UI.** Hoy se registra el folio con un `update`
  manual (ver arriba). `EmisorManual.confirmarEmision()` ya implementa la
  operación con sus validaciones; falta exponerla.

## Verificación contra Flow real (2026-09-03)

Lo consultado con `scripts/flow-probe.mjs`, para no volver a deducirlo de la
documentación pública (que no cubre estos endpoints).

### Las credenciales de producción son válidas y los planes existen

`plans/list` en producción devuelve los 3 planes con
`urlCallback = https://www.getpangui.com/api/suscripcion/webhook`, es decir el
webhook apunta al dominio correcto. Los `FLOW_PLAN_*` son los mismos strings en
ambos entornos (`basic` / `esencial` / `pro`), así que un `.env` con las claves
de un entorno y los planes del otro NO falla por plan inexistente: falla por
firma. Si Flow responde `501 apiKey not found`, casi siempre es que `FLOW_ENV`
no corresponde a las claves, no que las claves estén malas.

### El cupón de cliente fundador está bien configurado

`coupon/get couponId=6747` en producción:

```
name: "Cliente fundador  Pro 3990"   amount: 6000   currency: CLP
duration: 0 (indefinida)   max_redemptions: 1   expires: null   redemtions: 0
```

9.990 − 6.000 = 3.990, que es el precio pactado con Electrilam. `duration: 0`
lo hace permanente y `max_redemptions: 1` impide que se filtre a otro cliente.
Ojo: el cupón es **de monto fijo sobre el plan Pro**. Si un fundador cambiara a
Esencial (6.990), el mismo cupón lo dejaría en 990, no en 3.990 — el descuento
no se recalcula por tier.

### Estado real de producción

No hay ninguna suscripción viva: las 3 existentes están en `status: 4`
(cancelada), todas de pruebas de julio. Los 3 clientes tienen
`pay_mode: "manual"` y ninguno con tarjeta inscrita. Electrilam no tiene
cliente ni suscripción en Flow: usa Pro por cortesía, dado de alta a mano en la
base. Ese es exactamente el caso que cubre `isBilled` en la UI.

### previewChangePlan no se pudo probar

`subscription/previewChangePlan` responde `105 No services available` en
producción, tanto sobre una suscripción cancelada como sin ella. La hipótesis
más probable es que exige una suscripción **activa**, y hoy no hay ninguna.

Queda pendiente, y es la decisión de diseño más importante que falta cerrar:
**no sabemos si `changePlan` aplica de inmediato o al próximo período.** El
objeto de suscripción expone `newPlanId`, `new_plan_scheduled_change_date` e
`in_new_plan_next_attempt_date`, los tres en `null`, lo que sugiere que Flow
**agenda** el cambio en vez de aplicarlo al instante. Si eso se confirma, hay
dos consecuencias en el código actual:

1. En una **subida**, el diálogo de confirmación dice "Flow.cl cobrará la
   diferencia a tu tarjeta". Sería falso: el cliente pagaría el plan nuevo
   recién en la próxima factura.
2. En una **bajada**, `scheduled_plan_key` se materializa en el webhook, que
   llega *después* de que Flow emitió la factura del período nuevo. El cliente
   pagaría un mes extra al precio viejo.

**Cómo cerrarlo** — apenas exista una suscripción activa (la primera real, o
una de prueba en sandbox):

```powershell
node scripts/flow-probe.mjs .env.local subscription/get subscriptionId=sus_xxx
node scripts/flow-probe.mjs .env.local subscription/previewChangePlan subscriptionId=sus_xxx newPlanId=esencial --post
```

Y tras un `changePlan` real, volver a leer `subscription/get`: si
`new_plan_scheduled_change_date` queda con fecha, el cambio es diferido y hay
que ajustar tanto el texto de la subida como el momento de la bajada.

### Ítems de suscripción: el contrato real (2026-09-03)

`lib/flow-sync.ts` llamaba a `/subscription/addItem` con `name` y `amount`.
Flow responde `104 Missing service params: itemId`: **nunca agregó un ítem**,
y por eso los tres primeros cobros a Electrilam salieron por un solo usuario.

Lo verificado contra producción:

| Endpoint | Parámetros | Devuelve |
|---|---|---|
| `POST /subscription_item/create` | `name`, `amount` (≥ 350 CLP), `currency` | `{ id, name, amount, status }` |
| `GET /subscription_item/list` | `limit` | `{ data: [...] }` — catálogo del comercio |
| `POST /subscription/addItem` | `subscriptionId`, `itemId` | asocia con `quantity: 1` |
| `POST /subscription/updateItem` | `subscriptionId`, `itemId`, `quantity` | fija la cantidad |
| `POST /subscription/removeItem` | `subscriptionId`, `itemId` (*) | — |
| `GET /subscription/get` | `subscriptionId` | trae `items[]` con `item_id`, `quantity`, `amount` |
| `GET /subscription/listItems` | — | **`105 No services available` siempre**, con o sin ítems. No usar. |

(*) El nombre del parámetro de `removeItem` no quedó verificado: la única
prueba coincidió con una cancelación en paralelo y respondió 105.

Modelo: un ítem de catálogo por precio ("Usuario adicional $4.748") y una
sola asociación por suscripción con `quantity = usuarios cobrables − 1`.
Los ítems afectan la **próxima** factura, no una ya emitida: por eso una
suscripción creada sin ítems hay que cancelarla y recrearla, no parcharla.

### Datos útiles del objeto suscripción

Confirmado en una suscripción real: `days_until_due: 3` (días de gracia antes
de considerar vencido el importe) y `charges_retries_number: 3` en el plan
(Flow reintenta el cobro 3 veces). Cada `invoice` trae `attemp_count`,
`attemped` y `next_attemp_date`, que es de dónde saldría un aviso de
"reintentando tu cobro" si algún día se quiere mostrar.

### Nota sobre Git Bash

Un path que empieza con `/` es reescrito por MSYS a una ruta de Windows antes
de llegar a Node. `scripts/flow-probe.mjs` ya lo normaliza, pero por costumbre
conviene escribirlo sin barra inicial: `subscription/get`, no
`/subscription/get`.
