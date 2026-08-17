-- Migración a facturación electrónica afecta a IVA (SpA, primera categoría).
--
-- CONTEXTO
-- Hasta ahora Pangui operaba como persona natural de segunda categoría y el
-- documento tributario era la boleta de honorarios electrónica (BHE). Con la
-- constitución de la SpA eso deja de ser válido: una sociedad de primera
-- categoría no puede emitir BHE, debe emitir factura electrónica afecta a IVA.
--
-- Ver 20260728180754_billing_profiles.sql y 20260810120000_billing_profiles_bhe_destinatario.sql,
-- cuyos comentarios describen el modelo BHE anterior. No se borran columnas:
-- domicilio, region y comuna siguen siendo necesarias en la factura, y la regla
-- de CLAUDE.md exige DDL aditivo mientras las historias de migración no estén
-- reconciliadas.
--
-- PRECIOS
-- Los precios del catálogo (lib/flow-plans.ts) pasan a ser BRUTOS, con IVA
-- incluido: el cliente sigue pagando lo mismo que antes y el IVA sale del
-- margen. El desglose neto/IVA se calcula en lib/tributario.ts — nunca en SQL,
-- para tener una sola implementación de la regla de redondeo.

-- ── billing_profiles: campos que exige la factura y no la BHE ───────────────

-- El giro del receptor es obligatorio en la factura electrónica; la BHE no lo
-- pedía, por eso no existía.
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS giro   text;
-- La factura identifica la dirección con comuna Y ciudad.
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS ciudad text;

-- Tipo de receptor: determina qué documento corresponde emitir.
--   'empresa'  → factura electrónica afecta (DTE 33). Da crédito fiscal.
--   'persona'  → boleta de venta afecta (DTE 39). Consumidor final.
-- Por defecto 'empresa': Pangui es B2B y todos los clientes actuales lo son.
ALTER TABLE billing_profiles ADD COLUMN IF NOT EXISTS tipo_receptor text
  NOT NULL DEFAULT 'empresa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_profiles_tipo_receptor_check'
  ) THEN
    ALTER TABLE billing_profiles
      ADD CONSTRAINT billing_profiles_tipo_receptor_check
      CHECK (tipo_receptor IN ('empresa','persona'));
  END IF;
END $$;

-- ── documentos_tributarios ─────────────────────────────────────────────────
--
-- Un registro por documento tributario emitido. Hasta ahora no existía: el
-- script scripts/boletas-pendientes.sql listaba lo que había que emitir, pero
-- nada registraba lo ya emitido, así que no había forma de saber si un período
-- ya estaba facturado ni de responder una fiscalización.
--
-- Los montos se guardan desglosados y congelados al momento de emitir. No se
-- recalculan desde el precio del plan: si el precio cambia, los documentos
-- históricos deben seguir mostrando lo que efectivamente se cobró.
CREATE TABLE IF NOT EXISTS documentos_tributarios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, no CASCADE ni RESTRICT: un documento tributario emitido no puede
  -- desaparecer porque se borre el workspace (el SII ya lo tiene y hay que
  -- poder responder una fiscalización años después), pero RESTRICT rompería
  -- los rollbacks de /api/registro y /api/onboarding, que borran el workspace
  -- cuando la creación falla a medias. Los datos del receptor quedan
  -- congelados en las columnas receptor_*, así que el documento sigue siendo
  -- legible sin el workspace.
  workspace_id        uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  subscription_id     uuid REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Tipo de DTE según el SII: 33 factura afecta, 39 boleta de venta,
  -- 61 nota de crédito (anulación / devolución).
  tipo_dte            int  NOT NULL DEFAULT 33 CHECK (tipo_dte IN (33, 39, 61)),
  -- Folio asignado por el SII. Null mientras el documento está pendiente de
  -- emisión: la fila se crea al cobrarse y se completa al emitir en el portal.
  folio               int,

  -- Período de servicio que cubre el documento.
  periodo_inicio      date NOT NULL,
  periodo_fin         date NOT NULL,

  -- Montos congelados, en CLP entero. Invariante: neto + iva = total.
  neto_clp            int  NOT NULL CHECK (neto_clp  >= 0),
  iva_clp             int  NOT NULL CHECK (iva_clp   >= 0),
  total_clp           int  NOT NULL CHECK (total_clp >= 0),

  -- Base del cálculo, para poder auditar cómo se llegó al monto.
  usuarios_facturados int  NOT NULL CHECK (usuarios_facturados >= 0),
  precio_unitario_clp int  NOT NULL CHECK (precio_unitario_clp >= 0),

  -- Datos del receptor copiados al emitir. Si el cliente después cambia su
  -- razón social, el documento histórico conserva la que tenía.
  receptor_rut          text,
  receptor_razon_social text,
  receptor_giro         text,
  receptor_direccion    text,
  receptor_comuna       text,
  receptor_ciudad       text,
  receptor_email        text,

  estado              text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','emitido','anulado','error')),
  emitido_at          timestamptz,
  -- Referencia al pago de Flow que originó el documento.
  flow_invoice_id     text,
  -- Nota interna: motivo de anulación, número de la nota de crédito, etc.
  nota                text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- El total debe cuadrar con sus componentes. Si esta constraint salta, el
  -- cálculo de lib/tributario.ts se rompió y la factura sería rechazada por el
  -- SII: es mejor fallar al escribir que emitir un documento inconsistente.
  CONSTRAINT documentos_tributarios_cuadra CHECK (neto_clp + iva_clp = total_clp),
  CONSTRAINT documentos_tributarios_periodo CHECK (periodo_fin >= periodo_inicio)
);

CREATE INDEX IF NOT EXISTS idx_doc_trib_workspace ON documentos_tributarios(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_trib_estado    ON documentos_tributarios(estado);
CREATE INDEX IF NOT EXISTS idx_doc_trib_periodo   ON documentos_tributarios(periodo_inicio);

-- Un folio no puede repetirse dentro del mismo tipo de documento. Parcial
-- porque folio es null mientras el documento está pendiente.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_trib_folio
  ON documentos_tributarios(tipo_dte, folio)
  WHERE folio IS NOT NULL;

-- Evita facturar dos veces el mismo período de la misma suscripción. Las notas
-- de crédito (61) y los anulados quedan fuera: un período legítimamente puede
-- tener una factura anulada más su reemplazo.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_trib_periodo_suscripcion
  ON documentos_tributarios(subscription_id, periodo_inicio, periodo_fin)
  WHERE subscription_id IS NOT NULL AND tipo_dte <> 61 AND estado <> 'anulado';

ALTER TABLE documentos_tributarios ENABLE ROW LEVEL SECURITY;

-- Los documentos se crean y emiten con la service role key desde el servidor.
-- La política de lectura permite que un admin vea los documentos de su propio
-- workspace, nunca los de otro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'documentos_tributarios'
      AND policyname = 'documentos_tributarios: read own workspace'
  ) THEN
    -- `workspace_id IS NOT NULL AND` es necesario: workspace_id quedó nullable
    -- (ver el comentario de la FK) y en SQL `null = <uuid>` es null, no false.
    -- Sin el guardia, un documento huérfano no sería visible para nadie por la
    -- API pública, que es lo correcto, pero dejarlo explícito evita que un
    -- cambio futuro de la política lo vuelva visible para todos por accidente.
    CREATE POLICY "documentos_tributarios: read own workspace"
      ON documentos_tributarios FOR SELECT TO authenticated
      USING (workspace_id IS NOT NULL AND workspace_id = fn_mi_workspace());
  END IF;
END $$;

-- ── subscription_events: idempotencia del webhook (Fase 4) ─────────────────
--
-- El webhook de Flow puede llegar repetido (reintentos, entrega duplicada).
-- Hasta ahora cada llamada insertaba un evento nuevo y reprocesaba todo el
-- handler, lo que con cargo automático activo puede llamar changePlan dos
-- veces. Esta columna guarda una clave estable derivada del evento para poder
-- detectar el duplicado.
ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sub_events_idempotency
  ON subscription_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
