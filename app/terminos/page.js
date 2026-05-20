"use client";

import LegalLayout, { LegalSection, fadeUp } from "@/components/LegalLayout";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
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

// Re-implemented locally to avoid a cross-file import dependency.
function useIsNarrow(breakpoint = 640) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return narrow;
}

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

// ── Tabla de planes (responsive) ───────────────────────────────
function PlanesTable({ rows }) {
  const narrow = useIsNarrow(640);

  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
        {rows.map(([concepto, precio, detalle], i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--divider-1)",
              borderRadius: 8,
              padding: 12,
              background: "var(--background)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-1)" }}>{concepto}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", textAlign: "right", flexShrink: 0 }}>{precio}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--accent-5)", lineHeight: 1.55 }}>
              {detalle}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", margin: "12px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left" }}>
        <thead>
          <tr style={{ background: "var(--accent-2)" }}>
            {["Concepto", "Precio", "Detalle"].map((h) => (
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
          {rows.map(([concepto, precio, detalle], i) => (
            <tr
              key={concepto}
              style={{
                borderBottom: "1px solid var(--divider-1)",
                background: i % 2 === 0 ? "var(--background)" : "var(--accent-2)",
              }}
            >
              <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--accent-1)", verticalAlign: "top" }}>{concepto}</td>
              <td style={{ padding: "8px 12px", color: "var(--black)", verticalAlign: "top" }}>{precio}</td>
              <td style={{ padding: "8px 12px", color: "var(--accent-5)", verticalAlign: "top" }}>{detalle}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          definition="El conjunto de productos Pangui que permite crear, gestionar y ejecutar Órdenes de Trabajo para equipos de mantención. Incluye el Sitio Web y la Aplicación Móvil definidos a continuación, los cuales comparten la misma cuenta y los mismos datos."
        />
        <DefItem
          term="Sitio Web"
          definition="La aplicación web Pangui accesible en pangui.cl desde cualquier navegador moderno en computadores, tablets o smartphones. Es el canal principal para administradores: gestión de equipo, configuración del espacio de trabajo, exportación de reportes y administración de usuarios."
        />
        <DefItem
          term="Aplicación Móvil"
          definition="La aplicación nativa Pangui para Android e iOS, distribuida vía Google Play Store y Apple App Store. Está orientada al uso en terreno: ejecución de Órdenes de Trabajo, captura de fotos, llenado de procedimientos, firmas digitales y trabajo sin conexión con sincronización automática."
        />
        <DefItem
          term="Orden de Trabajo (OT)"
          definition="Documento digital que registra la solicitud, ejecución y revisión de un servicio de mantención."
        />
        <DefItem
          term="Usuario Administrador"
          definition="Persona o cuenta con rol de propietario o administrador del espacio de trabajo. Puede crear OT, invitar y desactivar usuarios, configurar el espacio y exportar reportes."
        />
        <DefItem
          term="Usuario Invitado"
          definition="Persona invitada por un Administrador al espacio de trabajo (típicamente técnicos en terreno o jefes de cuadrilla). Cada usuario invitado activo genera el cobro mensual descrito en la sección 4."
        />
        <DefItem
          term="Espacio de trabajo"
          definition="Unidad organizacional dentro de Pangui que agrupa a los usuarios, las OT y la configuración de una misma empresa o cliente."
        />
        <DefItem
          term="Nosotros / Pangui"
          definition="Los desarrolladores y operadores de la plataforma Pangui."
        />
        <DefItem
          term="Tú / Usuario"
          definition="Cualquier persona natural o jurídica que acceda y use el Servicio, ya sea a través del Sitio Web o de la Aplicación Móvil."
        />
      </LegalSection>

      {/* 2. Descripción del servicio */}
      <LegalSection icon={Code2} title="2. Descripción del servicio">
        <p>
          Pangui es una plataforma SaaS (Software como Servicio) que se ofrece
          a través de <strong>dos canales complementarios</strong>:
        </p>

        <p style={{ marginTop: 12, marginBottom: 6 }}>
          <strong>Sitio Web (pangui.cl)</strong> — orientado a administradores y
          jefes de mantención:
        </p>
        <Ul
          items={[
            "Crear y asignar Órdenes de Trabajo, plantillas y procedimientos.",
            "Configurar el espacio de trabajo: usuarios, ubicaciones, sociedades, categorías, hitos.",
            "Gestionar inventario de materiales con alertas de stock mínimo.",
            "Exportar reportes en PDF y Excel.",
            "Administrar usuarios invitados y configuración del workspace.",
          ]}
        />

        <p style={{ marginTop: 16, marginBottom: 6 }}>
          <strong>Aplicación Móvil (Android / iOS)</strong> — orientada a
          técnicos y jefes en terreno:
        </p>
        <Ul
          items={[
            "Recibir y ejecutar Órdenes de Trabajo asignadas.",
            "Capturar fotos del trabajo (antes, durante y después) con la cámara del dispositivo.",
            "Llenar hojas de inventario, procedimientos paso a paso y firmas digitales del cliente.",
            "Recibir notificaciones push en tiempo real sobre nuevas asignaciones, cambios de estado y vencimientos.",
            "Trabajar completamente sin conexión a internet: las acciones se guardan localmente y se sincronizan automáticamente al recuperar la señal.",
          ]}
        />

        <InfoBox>
          Ambos canales comparten la misma cuenta y los mismos datos. Lo que
          haces en uno se refleja en el otro. La Aplicación Móvil no es
          obligatoria: el Sitio Web cubre todas las funciones administrativas;
          y los técnicos pueden, alternativamente, usar el Sitio Web desde el
          navegador del teléfono cuando no requieran modo sin conexión.
        </InfoBox>

        <p>
          El Sitio Web es accesible desde cualquier navegador moderno. La
          Aplicación Móvil se distribuye exclusivamente a través de{" "}
          <strong>Google Play Store</strong> y <strong>Apple App Store</strong>;
          su instalación está sujeta también a los términos de uso de cada
          tienda.
        </p>

        <p style={{ marginTop: 16, marginBottom: 6 }}>
          <strong>Permisos solicitados por la Aplicación Móvil:</strong>
        </p>
        <Ul
          items={[
            "Cámara — para tomar fotos asociadas a una OT, escanear OTs físicas y registrar firmas. Solo se activa cuando tú tomas la foto.",
            "Galería / Fotos — para adjuntar imágenes ya existentes en tu dispositivo a una OT.",
            "Notificaciones — para avisarte de nuevas OT asignadas, recordatorios de cronómetro y vencimientos. Puedes desactivarlas desde la configuración del sistema operativo.",
            "Almacenamiento — para guardar fotos pendientes de subida y la base de datos local que permite trabajar sin conexión.",
          ]}
        />
        <p>
          La Aplicación Móvil <strong>no solicita acceso a tu ubicación
          (GPS)</strong>, contactos, micrófono ni a otras categorías sensibles.
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
        <p>
          Pangui puede usar un modelo de cobro por usuarios invitados o por
          condiciones comerciales acordadas con cada empresa. La cuenta
          administradora puede comenzar gratis; cualquier suscripción pagada
          se informa antes de activarse:
        </p>
        <PlanesTable
          rows={[
            ["Cuenta administradora", "Gratis", "Acceso inicial para configurar y evaluar la plataforma."],
            ["Usuario invitado adicional", "Según plan vigente", "Cobro mensual por usuarios invitados activos cuando corresponda."],
            ["Plan Enterprise", "A convenir", "Para empresas con necesidades particulares: SLA dedicado, integraciones, capacitación."],
          ]}
        />
        <p>
          El cobro se calcula al cierre de cada mes según la cantidad de
          usuarios activos en tu espacio de trabajo. Si invitas o desactivas
          usuarios durante el mes, el cobro se prorratea según los días de uso
          de cada uno.
        </p>
        <p>
          Pangui se reserva el derecho de modificar precios o condiciones con
          al menos <strong>30 días de aviso</strong> previo por correo
          electrónico cuando exista una suscripción activa.
        </p>
      </LegalSection>

      {/* 5. Período de prueba */}
      <LegalSection icon={RefreshCw} title="5. Período de prueba gratuita">
        <p>
          Al crear una cuenta administradora obtienes acceso{" "}
          <strong>completamente gratuito y sin límite de tiempo</strong> a la
          plataforma para uso individual. No se requiere tarjeta de crédito al
          registrarte.
        </p>
        <p>
          El cobro solo aplica cuando se activa una suscripción pagada o se
          acuerdan usuarios invitados pagados según lo descrito en la sección 4.
        </p>
      </LegalSection>

      {/* 6. Pago y cobro */}
      <LegalSection icon={CreditCard} title="6. Pago y cobro">
        <p>
          El cobro por usuarios invitados se realiza mensualmente en
          pesos chilenos (CLP):
        </p>
        <Ul
          items={[
            "El ciclo de cobro se calcula al cierre de cada mes calendario.",
            "El documento tributario de la suscripción, cuando corresponda, se gestiona fuera de las órdenes de trabajo.",
            "El cobro se calcula sobre la cantidad de usuarios invitados activos durante el mes; se prorratea por los días de uso de cada usuario.",
            "El pago se realiza mediante los métodos disponibles en la plataforma.",
            "En caso de no pago, los accesos de los usuarios invitados se suspenden hasta regularizar el saldo. La cuenta administradora conserva su acceso gratuito.",
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
          <strong>10 días hábiles</strong> siguientes al primer cobro pagado
          por usuarios invitados, con reembolso íntegro del monto pagado.
        </p>
        <InfoBox>
          Para ejercer el retracto: envía un correo a{" "}
          <a href="mailto:contacto@getpangui.com" style={{ color: "var(--accent-1)" }}>
            contacto@getpangui.com
          </a>{" "}
          con el asunto &quot;Retracto de compra&quot; dentro del plazo legal. El
          reembolso se procesa en un máximo de 10 días hábiles.
        </InfoBox>
        <p>
          <strong>Desactivación de usuarios invitados:</strong> Puedes
          desactivar usuarios invitados en cualquier momento desde tu panel de
          administración. El cobro mensual se prorratea según los días en que
          el usuario estuvo activo.
        </p>
        <p>
          <strong>Cancelación de cuenta:</strong> Puedes cancelar
          completamente tu cuenta administradora desde Configuración → Cuenta.
          Tras la cancelación, tus datos se conservan según los plazos
          descritos en la Política de Privacidad para cumplir obligaciones
          tributarias.
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
            "Fallas en servicios de terceros (Supabase, Cloudflare, Vercel, Expo, Google, Apple) fuera de nuestro control.",
            "Interrupciones por fuerza mayor: desastres naturales, cortes de energía masivos, ciberataques externos de gran escala.",
            "Pérdida de datos no sincronizados de la Aplicación Móvil cuando el dispositivo se daña, pierde o desinstala la app antes de que la cola de sincronización se haya enviado al servidor.",
            "Uso incorrecto de las funciones de exportación o interpretación errónea de datos exportados.",
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
          El Servicio Pangui, incluyendo el Sitio Web, la Aplicación Móvil, su
          código fuente, diseño, marca, logotipos y documentación, son
          propiedad exclusiva de sus desarrolladores y están protegidos por las
          leyes de propiedad intelectual chilenas (Ley 17.336).
        </p>
        <p>
          Se te otorga una <strong>licencia limitada, no exclusiva,
          intransferible y revocable</strong> para usar el Sitio Web y/o la
          Aplicación Móvil durante la vigencia de tu cuenta, exclusivamente
          para los fines comerciales propios de tu empresa.
        </p>
        <p>
          La instalación de la Aplicación Móvil desde Google Play Store o
          Apple App Store está sujeta adicionalmente a los términos y
          condiciones de cada tienda. Estos Términos no contradicen ni
          reemplazan dichas condiciones.
        </p>
        <p>
          <strong>Tus datos son tuyos:</strong> Pangui no reivindica propiedad
          sobre los datos que ingresas al sistema (OT, materiales, fotos,
          firmas, hojas de inventario). Puedes exportarlos en cualquier
          momento en formato PDF, Excel o JSON desde el Sitio Web.
        </p>
      </LegalSection>

      {/* 10. Uso aceptable */}
      <LegalSection icon={XCircle} title="10. Uso aceptable">
        <p>Queda prohibido usar Pangui (Sitio Web o Aplicación Móvil) para:</p>
        <Ul
          items={[
            "Control de jornada laboral de trabajadores sin la certificación requerida por la Dirección del Trabajo (DT). La función de registro de inicio/fin de OT no constituye sistema de control de asistencia homologado.",
            "Almacenar, transmitir o procesar contenido ilegal, difamatorio o que viole derechos de terceros.",
            "Intentar acceder a cuentas o datos de otras empresas o espacios de trabajo.",
            "Realizar ingeniería inversa, descompilar, modificar o redistribuir el Sitio Web o la Aplicación Móvil, ni intentar obtener el código fuente o las claves del producto.",
            "Eludir o intentar eludir mecanismos de autenticación, control de acceso o cuotas de uso.",
            "Usar el Servicio para fines distintos a la gestión de mantención empresarial.",
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
          <strong>Por tu parte:</strong> Puedes cancelar tu suscripción o
          eliminar completamente tu cuenta en cualquier momento desde
          Configuración → Cuenta. La eliminación de cuenta dispara el proceso
          descrito en la Política de Privacidad. Ver también cláusula 7.
        </p>
        <p>
          <strong>Por parte de Pangui:</strong> Podemos suspender o terminar tu
          cuenta si:
        </p>
        <Ul
          items={[
            "Incumples estos Términos o la Política de Privacidad.",
            "Hay impago de la suscripción por usuarios invitados por más de 15 días corridos (la suspensión afecta solo a los accesos de usuarios invitados; la cuenta administradora conserva su acceso gratuito).",
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
        <strong>Última actualización: mayo de 2026.</strong> Este documento
        tiene carácter informativo y no reemplaza asesoría legal profesional.
        Recomendamos consultar con un abogado especialista en derecho
        tecnológico y protección al consumidor para situaciones específicas de
        tu empresa.
      </motion.div>
    </LegalLayout>
  );
}
