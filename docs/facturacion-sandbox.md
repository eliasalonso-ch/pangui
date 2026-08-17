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

### Decisión de precios: IVA incluido

Los precios del catálogo (`lib/flow-plans.ts`) son **brutos, con IVA incluido**.
El cliente sigue pagando lo mismo que antes; el IVA sale del margen.

| Plan     | Total (cliente) | Neto   | IVA    |
|----------|-----------------|--------|--------|
| Basic    | $4.990          | $4.193 | $797   |
| Esencial | $6.990          | $5.874 | $1.116 |
| Pro      | $9.990          | $8.395 | $1.595 |

Nadie recibe un aviso de subida de precio. La ley exige que el IVA esté
correctamente calculado y declarado, no que se sume por fuera.

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
