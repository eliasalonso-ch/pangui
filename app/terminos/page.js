"use client";

import LegalLayout, { LegalSection, fadeUp } from "@/components/LegalLayout";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  BookOpen,
  CreditCard,
  RotateCcw,
  AlertTriangle,
  Code2,
  Shield,
  Database,
  XCircle,
  Globe,
  RefreshCw,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────

function Ul({ items }) {
  return (
    <ul style={{ margin: "8px 0 0 0", padding: 0, listStyle: "none" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 6,
            fontSize: 15,
            color: "var(--accent-5)",
            lineHeight: 1.6,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              marginTop: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent-1)",
            }}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Ol({ items }) {
  return (
    <ol style={{ margin: "8px 0 0 0", padding: "0 0 0 20px" }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            marginBottom: 8,
            fontSize: 15,
            color: "var(--accent-5)",
            lineHeight: 1.6,
          }}
        >
          {item}
        </li>
      ))}
    </ol>
  );
}

function InfoBox({ children, color = "var(--accent-1)", bg = "var(--accent-2)", text = "var(--accent-1)" }) {
  return (
    <div
      style={{
        borderLeft: `4px solid ${color}`,
        background: bg,
        padding: "12px 16px",
        borderRadius: "0 6px 6px 0",
        fontSize: 14,
        color: text,
        lineHeight: 1.65,
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}

function DefItem({ term, definition }) {
  return (
    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--divider-1)" }}>
      <span style={{ fontWeight: 700, color: "var(--accent-1)" }}>{term}:</span>{" "}
      <span style={{ color: "var(--accent-5)", fontSize: 15 }}>{definition}</span>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export default function TerminosPage() {
  return (
    <LegalLayout
      title="Términos y Condiciones"
      description="Condiciones de uso del servicio Pangui conforme a la Ley 19.496 de Protección al Consumidor y el Código Civil de Chile."
    >
      {/* Intro */}
      <motion.p
        variants={fadeUp}
        style={{
          fontSize: 15,
          color: "var(--accent-5)",
          lineHeight: 1.7,
          marginBottom: 32,
          paddingBottom: 24,
          borderBottom: "1px solid var(--divider-1)",
        }}
      >
        Al crear una cuenta en Pangui aceptas estos Términos y Condiciones. Si
        actúas en nombre de una empresa, declaras tener facultades suficientes
        para obligarla. Si no estás de acuerdo, no uses el servicio.
      </motion.p>

      {/* 1. Definiciones */}
      <LegalSection icon={BookOpen} title="1. Definiciones">
        <DefItem
          term="Servicio"
          definition="La plataforma web y PWA Pangui, que permite crear, gestionar y facturar Órdenes de Trabajo para equipos de mantención."
        />
        <DefItem
          term="Orden de Trabajo (OT)"
          definition="Documento digital que registra la solicitud, ejecución, revisión y facturación de un servicio de mantención."
        />
        <DefItem
          term="Usuario Jefe"
          definition="Persona con rol de supervisión que crea OT, asigna técnicos, revisa trabajos y emite facturas."
        />
        <DefItem
          term="Usuario Técnico"
          definition="Persona que ejecuta los trabajos en terreno, registra fotos, materiales y firma digital del cliente."
        />
        <DefItem
          term="Planta"
          definition="Unidad organizacional dentro de Pangui que agrupa usuarios, clientes y OT de una misma empresa."
        />
        <DefItem
          term="DTE"
          definition="Documento Tributario Electrónico emitido mediante la integración con SimpleFactura."
        />
        <DefItem
          term="Nosotros / Pangui"
          definition="Los desarrolladores y operadores de la plataforma Pangui."
        />
        <DefItem
          term="Tú / Usuario"
          definition="Cualquier persona natural o jurídica que acceda y use el Servicio."
        />
      </LegalSection>

      {/* 2. Descripción del servicio */}
      <LegalSection icon={Code2} title="2. Descripción del servicio">
        <p>
          Pangui es una plataforma SaaS (Software como Servicio) que permite a
          contratistas y empresas de mantención en Chile:
        </p>
        <Ul
          items={[
            "Crear y gestionar Órdenes de Trabajo con asignación a técnicos.",
            "Ejecutar trabajos en terreno con registro de fotos, firma digital y materiales.",
            "Gestionar inventario de materiales con alertas de stock mínimo.",
            "Emitir Documentos Tributarios Electrónicos mediante SimpleFactura.",
            "Recibir notificaciones push en tiempo real.",
            "Exportar reportes en PDF y Excel.",
            "Funcionar parcialmente sin conexión a internet (modo offline PWA).",
          ]}
        />
        <p style={{ marginTop: 12 }}>
          El Servicio opera como aplicación web progresiva (PWA) accesible
          desde cualquier navegador moderno en computadores, tablets y
          smartphones, sin necesidad de instalar una aplicación nativa.
        </p>
      </LegalSection>

      {/* 3. Cuenta de usuario */}
      <LegalSection icon={Shield} title="3. Cuenta de usuario">
        <p>Para usar Pangui debes:</p>
        <Ul
          items={[
            "Ser mayor de 18 años o tener representación legal de tu empresa.",
            "Proporcionar información verídica al registrarte.",
            "Mantener la confidencialidad de tu contraseña.",
            "Notificarnos de inmediato ante cualquier acceso no autorizado a tu cuenta.",
          ]}
        />
        <p style={{ marginTop: 12 }}>
          Eres responsable de todas las acciones realizadas desde tu cuenta.
          Pangui no responde por pérdidas derivadas del uso no autorizado de
          credenciales que no hayas reportado oportunamente.
        </p>
      </LegalSection>

      {/* 4. Planes y precios */}
      <LegalSection icon={CreditCard} title="4. Planes y precios">
        <p>Pangui ofrece los siguientes planes:</p>
        <div style={{ overflowX: "auto", margin: "12px 0" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ background: "var(--accent-2)" }}>
                {["Plan", "Precio", "Técnicos", "OT", "Facturación"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      fontWeight: 700,
                      color: "var(--black)",
                      borderBottom: "2px solid var(--divider-1)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Gratis", "30 días de prueba", "1", "Hasta 50/mes", "No incluida"],
                ["Pro", "$19.990 CLP/mes", "Ilimitados", "Ilimitadas", "SimpleFactura ✓"],
                ["Enterprise", "A convenir", "Ilimitados", "Ilimitadas", "SimpleFactura ✓"],
              ].map(([plan, precio, tec, ot, fact], i) => (
                <tr
                  key={plan}
                  style={{
                    borderBottom: "1px solid var(--divider-1)",
                    background: i % 2 === 0 ? "var(--background)" : "var(--accent-2)",
                  }}
                >
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--accent-1)" }}>{plan}</td>
                  <td style={{ padding: "8px 12px", color: "var(--black)" }}>{precio}</td>
                  <td style={{ padding: "8px 12px", color: "var(--accent-5)" }}>{tec}</td>
                  <td style={{ padding: "8px 12px", color: "var(--accent-5)" }}>{ot}</td>
                  <td style={{ padding: "8px 12px", color: "var(--accent-5)" }}>{fact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Los precios incluyen IVA (19%). Pangui se reserva el derecho de
          modificar los precios con al menos <strong>30 días de aviso</strong>{" "}
          previo por correo electrónico.
        </p>
      </LegalSection>

      {/* 5. Período de prueba */}
      <LegalSection icon={RefreshCw} title="5. Período de prueba gratuita">
        <p>
          Al registrarte accedes a <strong>30 días de prueba gratuita</strong>{" "}
          con acceso a todas las funciones del plan Pro. No se requiere tarjeta
          de crédito.
        </p>
        <Ul
          items={[
            "Al término de los 30 días, el acceso se limita al plan Gratis automáticamente.",
            "No se realizan cobros automáticos al finalizar la prueba.",
            "Para continuar con el plan Pro, debes suscribirte manualmente.",
          ]}
        />
      </LegalSection>

      {/* 6. Pago y facturación */}
      <LegalSection icon={CreditCard} title="6. Pago y facturación">
        <p>
          La suscripción al plan Pro se factura mensualmente en pesos chilenos
          (CLP):
        </p>
        <Ul
          items={[
            "El ciclo de facturación comienza el día de activación del plan.",
            "Emitimos una boleta electrónica o factura según corresponda.",
            "El pago se realiza mediante los métodos disponibles en la plataforma.",
            "En caso de no pago, el acceso Pro se suspende y se degrada al plan Gratis.",
            "Pangui no almacena datos de tarjetas de crédito; el procesamiento es responsabilidad de los procesadores de pago habilitados.",
          ]}
        />
      </LegalSection>

      {/* 7. Cancelación y retracto */}
      <LegalSection icon={RotateCcw} title="7. Cancelación y derecho a retracto">
        <p>
          <strong>Derecho a retracto (Ley 19.496, Art. 3 bis):</strong> Por
          tratarse de un contrato de servicio celebrado por medios electrónicos
          (a distancia), tienes derecho a retractarte dentro de los{" "}
          <strong>10 días hábiles</strong> siguientes a la activación del plan
          Pro, con reembolso íntegro del monto pagado.
        </p>
        <InfoBox>
          Para ejercer el retracto: envía un correo a{" "}
          <a href="mailto:hola@pangui.cl" style={{ color: "var(--accent-1)" }}>
            hola@pangui.cl
          </a>{" "}
          con el asunto "Retracto de compra" dentro del plazo legal. El
          reembolso se procesa en un máximo de 10 días hábiles.
        </InfoBox>
        <p>
          <strong>Cancelación voluntaria:</strong> Puedes cancelar tu
          suscripción en cualquier momento desde Configuración. La cancelación
          es efectiva al término del período mensual ya pagado; no hay
          reembolsos proporcionales para cancelaciones fuera del período de
          retracto.
        </p>
        <p>
          Tras la cancelación, tus datos se conservan según los plazos descritos
          en la Política de Privacidad para cumplir obligaciones tributarias.
        </p>
      </LegalSection>

      {/* 8. Responsabilidad limitada */}
      <LegalSection icon={AlertTriangle} title="8. Responsabilidad limitada y nivel de servicio">
        <p>
          <strong>Disponibilidad:</strong> Pangui busca mantener una
          disponibilidad del <strong>99% mensual</strong> (tiempo de inactividad
          máximo permitido: ~7,2 horas/mes). Sin embargo, no garantizamos
          disponibilidad ininterrumpida.
        </p>
        <p>
          No asumimos responsabilidad por:
        </p>
        <Ul
          items={[
            "Pérdidas económicas indirectas o lucro cesante derivados de interrupciones del servicio.",
            "Errores en los datos ingresados por los usuarios.",
            "Fallas en servicios de terceros (Supabase, SimpleFactura, Vercel) fuera de nuestro control.",
            "Interrupciones por fuerza mayor: desastres naturales, cortes de energía masivos, ciberataques externos de gran escala.",
            "Uso incorrecto de las funciones de facturación o interpretación errónea de datos exportados.",
          ]}
        />
        <InfoBox bg="#fff7ed" color="#f97316" text="#9a3412">
          <strong>Advertencia:</strong> Pangui es una herramienta de gestión
          operacional. No reemplaza ni valida el cumplimiento de normativas
          sectoriales (eléctricas, sanitarias, etc.). La responsabilidad
          técnica de los trabajos realizados es siempre del ejecutor.
        </InfoBox>
        <p>
          En ningún caso la responsabilidad total de Pangui hacia ti excederá
          el monto pagado en los <strong>3 meses anteriores</strong> al evento
          que originó el daño (Art. 1556 Código Civil).
        </p>
      </LegalSection>

      {/* 9. Propiedad intelectual */}
      <LegalSection icon={Code2} title="9. Propiedad intelectual">
        <p>
          La plataforma Pangui, incluyendo su código fuente, diseño, marca,
          logotipos y documentación, son propiedad exclusiva de sus
          desarrolladores y están protegidos por las leyes de propiedad
          intelectual chilenas (Ley 17.336).
        </p>
        <p>
          Se te otorga una <strong>licencia limitada, no exclusiva,
          intransferible</strong> para usar el Servicio durante la vigencia de
          tu suscripción, exclusivamente para los fines comerciales propios de
          tu empresa.
        </p>
        <p>
          <strong>Tus datos son tuyos:</strong> Pangui no reivindica propiedad
          sobre los datos que ingresas al sistema (OT, clientes, inventario).
          Puedes exportarlos en cualquier momento en formato PDF, Excel o JSON.
        </p>
      </LegalSection>

      {/* 10. Uso aceptable */}
      <LegalSection icon={XCircle} title="10. Uso aceptable">
        <p>Queda prohibido usar Pangui para:</p>
        <Ul
          items={[
            "Control de jornada laboral de trabajadores sin la certificación requerida por la Dirección del Trabajo (DT). La función de registro de inicio/fin de OT no constituye sistema de control de asistencia homologado.",
            "Almacenar, transmitir o procesar contenido ilegal, difamatorio o que viole derechos de terceros.",
            "Intentar acceder a cuentas o datos de otras empresas.",
            "Realizar ingeniería inversa, descompilar o intentar obtener el código fuente.",
            "Usar el servicio para fines distintos a la gestión de mantención empresarial.",
            "Revender, sublicenciar o transferir el acceso a terceros.",
          ]}
        />
        <p>
          El incumplimiento de esta sección puede derivar en la suspensión
          inmediata de la cuenta sin derecho a reembolso.
        </p>
      </LegalSection>

      {/* 11. Datos del usuario */}
      <LegalSection icon={Database} title="11. Tus datos">
        <p>
          Eres propietario de todos los datos que ingresas a Pangui. Nosotros
          actuamos como encargado del tratamiento en tu nombre.
        </p>
        <Ul
          items={[
            "Puedes exportar todos tus datos en PDF, Excel o JSON desde la plataforma en cualquier momento.",
            "Al eliminar tu cuenta, tus datos se eliminan según lo descrito en la Política de Privacidad.",
            "Pangui puede usar datos anonimizados y agregados para mejorar el servicio (sin identificar a tu empresa).",
          ]}
        />
        <p>
          Consulta nuestra{" "}
          <Link href="/privacidad" style={{ color: "var(--accent-1)" }}>
            Política de Privacidad
          </Link>{" "}
          para mayor detalle sobre tratamiento de datos personales.
        </p>
      </LegalSection>

      {/* 12. Terminación */}
      <LegalSection icon={XCircle} title="12. Terminación del servicio">
        <p>
          <strong>Por tu parte:</strong> Puedes cancelar en cualquier momento
          desde Configuración. Ver cláusula 7.
        </p>
        <p>
          <strong>Por parte de Pangui:</strong> Podemos suspender o terminar tu
          cuenta si:
        </p>
        <Ul
          items={[
            "Incumples estos Términos o la Política de Privacidad.",
            "Hay impago por más de 15 días corridos.",
            "Detectamos uso fraudulento o actividad ilegal.",
            "Discontinuamos el servicio con 60 días de aviso previo.",
          ]}
        />
        <p>
          En caso de discontinuación, ofreceremos un período de exportación de
          datos de al menos <strong>30 días</strong> antes del cierre definitivo.
        </p>
      </LegalSection>

      {/* 13. Ley aplicable */}
      <LegalSection icon={Globe} title="13. Ley aplicable y jurisdicción">
        <p>
          Estos Términos se rigen por las leyes de la República de Chile,
          especialmente:
        </p>
        <Ul
          items={[
            "Ley 19.496 — Protección de los Derechos de los Consumidores.",
            "Código Civil de Chile — Obligaciones contractuales.",
            "Ley 20.659 y normativas del SII — Facturación electrónica.",
            "Ley 21.719 — Protección de Datos Personales.",
          ]}
        />
        <p>
          Para cualquier controversia derivada de estos Términos, las partes se
          someten a la jurisdicción de los{" "}
          <strong>Tribunales Ordinarios de Justicia de Santiago de Chile</strong>
          , sin perjuicio del derecho del consumidor de acudir al Juzgado de
          Policía Local correspondiente conforme a la Ley 19.496.
        </p>
      </LegalSection>

      {/* 14. Modificaciones */}
      <LegalSection icon={RefreshCw} title="14. Modificaciones a estos Términos">
        <p>
          Podemos modificar estos Términos en cualquier momento. Te notificaremos
          por correo electrónico con al menos <strong>30 días de
          anticipación</strong> para cambios sustanciales. El uso continuado del
          Servicio tras ese plazo implica aceptación de los nuevos términos.
        </p>
        <p>
          Si no estás de acuerdo con los cambios, puedes cancelar tu suscripción
          antes de que entren en vigor y tendrás derecho a exportar tus datos.
        </p>
      </LegalSection>

      {/* Disclaimer */}
      <motion.div
        variants={fadeUp}
        style={{
          marginTop: 32,
          padding: "16px 20px",
          background: "var(--accent-2)",
          borderTop: "3px solid var(--divider-1)",
          fontSize: 13,
          color: "var(--accent-5)",
          lineHeight: 1.65,
        }}
      >
        <strong>Última actualización: marzo de 2026.</strong> Este documento
        tiene carácter informativo y no reemplaza asesoría legal profesional.
        Recomendamos consultar con un abogado especialista en derecho
        tecnológico y protección al consumidor para situaciones específicas de
        tu empresa.
      </motion.div>
    </LegalLayout>
  );
}
