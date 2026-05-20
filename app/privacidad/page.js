"use client";

import LegalLayout, { LegalSection, fadeUp } from "@/components/LegalLayout";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Database,
  Target,
  Scale,
  Share2,
  UserCheck,
  Clock,
  Lock,
  Cookie,
  Baby,
  RefreshCw,
  Mail,
} from "lucide-react";

// Tracks whether the viewport is narrower than `breakpoint` so components
// can render a stacked card layout instead of an overflow-scrolling table.
// Listens to changes so rotating the device or resizing the browser updates
// the layout in real time.
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

// ── Helpers de estilos ─────────────────────────────────────────

/** Lista con bullet brand */
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

/** Bloque destacado azul */
function InfoBox({ children }) {
  return (
    <div
      style={{
        borderLeft: "4px solid var(--accent-1)",
        background: "var(--accent-2)",
        padding: "12px 16px",
        borderRadius: "0 6px 6px 0",
        fontSize: 14,
        color: "var(--accent-1)",
        lineHeight: 1.65,
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}

/** Pill badge para "Obligatorio" sí/no */
function ObligPill({ value }) {
  const isYes = value === "Sí";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        background: isYes ? "#dcfce7" : "var(--accent-2)",
        color: isYes ? "#166534" : "var(--accent-5)",
      }}
    >
      {value}
    </span>
  );
}

/** Tabla de datos. En pantallas estrechas (≤640px) cambia a tarjetas
 *  apiladas para evitar el scroll horizontal y el truncado. */
function DataTable({ rows }) {
  const narrow = useIsNarrow(640);

  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
        {rows.map(([cat, datos, oblig], i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--divider-1)",
              borderRadius: 8,
              padding: 12,
              background: "var(--background)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--black)" }}>{cat}</span>
              <ObligPill value={oblig} />
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--accent-5)", lineHeight: 1.55 }}>
              {datos}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
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
            <th style={{ padding: "8px 12px", fontWeight: 700, color: "var(--black)", borderBottom: "2px solid var(--divider-1)" }}>
              Categoría
            </th>
            <th style={{ padding: "8px 12px", fontWeight: 700, color: "var(--black)", borderBottom: "2px solid var(--divider-1)" }}>
              Datos específicos
            </th>
            <th style={{ padding: "8px 12px", fontWeight: 700, color: "var(--black)", borderBottom: "2px solid var(--divider-1)" }}>
              Obligatorio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([cat, datos, oblig], i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--divider-1)", background: i % 2 === 0 ? "var(--background)" : "var(--accent-2)" }}
            >
              <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--black)", verticalAlign: "top" }}>{cat}</td>
              <td style={{ padding: "8px 12px", color: "var(--accent-5)", verticalAlign: "top" }}>{datos}</td>
              <td style={{ padding: "8px 12px", verticalAlign: "top" }}>
                <ObligPill value={oblig} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export default function PrivacidadPage() {
  return (
    <LegalLayout
      title="Política de Privacidad"
      description="Cómo recolectamos, usamos y protegemos tus datos personales conforme a la Ley 21.719 de Chile."
    >
      {/* 0. Identificación del responsable */}
      <LegalSection icon={Mail} title="1. Responsable del tratamiento">
        <p>
          El responsable del tratamiento de tus datos personales es{" "}
          <strong>Pangui</strong>, plataforma SaaS de gestión de órdenes de
          trabajo para equipos de mantención en Chile. Para consultas sobre
          privacidad escríbenos a{" "}
          <a href="mailto:contacto@getpangui.com" style={{ color: "var(--accent-1)" }}>
            contacto@getpangui.com
          </a>
          .
        </p>
        <InfoBox>
          Cumplimos la <strong>Ley 21.719</strong> de Protección de Datos
          Personales (vigencia plena 1 de diciembre de 2026) y ofrecemos un{" "}
          <Link href="/arco" style={{ color: "#273D88", fontWeight: 600 }}>
            Portal ARCO
          </Link>{" "}
          para ejercer tus derechos de forma gratuita.
        </InfoBox>
      </LegalSection>

      {/* 1. Qué datos recolectamos */}
      <LegalSection icon={Database} title="2. Datos que recolectamos">
        <p>
          Recolectamos únicamente los datos necesarios para prestarte el
          servicio (principio de minimización, Art. 3 Ley 21.719):
        </p>
        <DataTable
          rows={[
            ["Identidad", "Nombre, apellido, correo electrónico", "Sí"],
            ["Empresarial", "Nombre de la empresa/planta, cargo y oficio del usuario", "Sí"],
            ["Órdenes de trabajo", "Título, descripción, comentarios, fotos del trabajo, materiales utilizados, hojas de inventario, archivos adjuntos (PDF, planos, Excel, etc.)", "Sí"],
            ["Firma digital", "Imagen de firma del cliente receptor del trabajo", "No (según el procedimiento)"],
            ["Procedimientos", "Respuestas a pasos del procedimiento (texto, números, opciones, fotos, firmas)", "No (según el procedimiento)"],
            ["Uso del servicio", "Logs de acceso, dispositivo, sistema operativo, dirección IP", "No (técnico)"],
            ["Notificaciones", "Token push del dispositivo móvil (Expo Push) para envío de alertas en Android/iOS", "No (opcional)"],
          ]}
        />
        <p style={{ marginTop: 12 }}>
          <strong>No recolectamos</strong> datos sensibles como datos de salud,
          origen étnico, opiniones políticas ni biométricos (la firma digital es
          una imagen, no dato biométrico conforme Art. 2 Ley 21.719).
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>No recolectamos ubicación GPS del dispositivo.</strong> La aplicación móvil
          no solicita permiso de geolocalización. Las fotos tomadas con la cámara dentro de la
          app son procesadas y comprimidas antes de subirse, removiendo metadatos EXIF de
          ubicación. Las fotos elegidas desde tu galería para imágenes de portada (ubicaciones,
          sociedades, lugares, partes) pueden conservar metadatos EXIF del archivo original;
          si tu galería tiene activado el guardado de ubicación, esos datos podrían viajar con
          la imagen. Puedes desactivar esto en la configuración de tu sistema operativo.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Función de escaneo de OT (OCR con IA):</strong> Si usas la función &quot;Escanear OT&quot;
          para crear una orden a partir de un documento físico, la imagen capturada se envía a
          Google Gemini (Google LLC) en EE.UU. para extraer el texto. Se procesa de forma efímera
          y no se usa para entrenar modelos de IA conforme a las condiciones del servicio Gemini API.
        </p>
      </LegalSection>

      {/* 2. Finalidades */}
      <LegalSection icon={Target} title="3. Finalidades del tratamiento">
        <p>Tus datos se usan exclusivamente para:</p>
        <Ul
          items={[
            "Crear, asignar y gestionar Órdenes de Trabajo entre técnicos y jefes de mantención.",
            "Enviar notificaciones dentro del sitio web y notificaciones push en la app móvil sobre cambios en el estado de las OT.",
            "Gestionar el inventario de materiales y generar alertas de stock mínimo.",
            "Exportar reportes PDF y Excel para auditoría interna de tu empresa.",
            "Autenticarte de forma segura mediante Supabase Auth.",
            "Mejorar el servicio mediante análisis de uso agregado y anonimizado.",
          ]}
        />
        <InfoBox>
          <strong>No usamos tus datos para publicidad de terceros</strong>, ni
          los vendemos, arrendamos ni cedemos a terceros con fines comerciales.
        </InfoBox>
      </LegalSection>

      {/* 3. Base legal */}
      <LegalSection icon={Scale} title="4. Base legal del tratamiento">
        <p>
          Tratamos tus datos bajo las siguientes bases legales (Art. 12 y 13,
          Ley 21.719):
        </p>
        <Ul
          items={[
            "Ejecución de contrato: el tratamiento es necesario para prestarte el servicio de gestión de OT que suscribiste.",
            "Consentimiento: para el envío de notificaciones push en la app móvil. Puedes denegar o retirar este permiso desde la configuración del sistema operativo, sin afectar el resto del servicio.",
            "Obligación legal: conservación de documentos tributarios y registros contables conforme a la normativa del SII (5 años).",
            "Interés legítimo: logs de seguridad para detectar accesos no autorizados y proteger la integridad de la plataforma.",
          ]}
        />
      </LegalSection>

      {/* 4. Con quién compartimos */}
      <LegalSection icon={Share2} title="5. Encargados del tratamiento (terceros)">
        <p>
          Compartimos datos solo con proveedores estrictamente necesarios, todos
          con obligaciones contractuales de confidencialidad:
        </p>
        <Ul
          items={[
            "Supabase Inc. (EE.UU.) — Base de datos PostgreSQL, autenticación, Edge Functions y logs. Infraestructura en AWS us-east-1. Cumple SOC 2 Type II.",
            "Cloudflare, Inc. (EE.UU.) — Almacenamiento de fotos, firmas y archivos adjuntos en Cloudflare R2 (servidos vía cdn.getpangui.com). Cumple SOC 2 e ISO 27001.",
            "Google LLC (EE.UU.) — Google Gemini API, usado únicamente cuando el usuario escanea una OT física para extraer texto del documento. Las imágenes se procesan de forma efímera. También Firebase Cloud Messaging para entrega de notificaciones push en Android.",
            "Expo (650 Industries, Inc., EE.UU.) — Servicio de notificaciones push (Expo Push) y entrega de actualizaciones de la app móvil (Expo Updates). El token push se asocia a tu cuenta.",
            "Vercel Inc. (EE.UU.) — Hosting del sitio web y backend de generación de PDF (pdf.getpangui.com). El servicio de PDF recibe el contenido completo de la OT que solicitas exportar.",
            "Resend Inc. (EE.UU.) — Envío de correos transaccionales (confirmación de cuenta, invitaciones, avisos). Solo recibe email y contenido del mensaje.",
            "Apple Inc. y Google LLC (EE.UU.) — Tiendas de aplicaciones (App Store, Google Play) para distribución de la app móvil; reciben datos de instalación y uso conforme a sus propias políticas.",
          ]}
        />
        <p>
          Para transferencias internacionales a EE.UU., nos amparamos en las
          cláusulas contractuales estándar y en las adecuaciones de seguridad
          de cada proveedor conforme al Art. 28 Ley 21.719.
        </p>
      </LegalSection>

      {/* 5. Derechos ARCOP */}
      <LegalSection icon={UserCheck} title="6. Tus derechos ARCOP (Ley 21.719)">
        <p>
          Como titular de datos personales en Chile tienes los siguientes
          derechos:
        </p>
        <Ul
          items={[
            "Acceso: saber qué datos tenemos sobre ti y cómo los usamos.",
            "Rectificación: corregir datos inexactos o desactualizados.",
            "Cancelación (supresión): solicitar la eliminación de tus datos cuando ya no sean necesarios.",
            "Oposición: oponerte al tratamiento basado en interés legítimo.",
            "Portabilidad: recibir tus datos en formato estructurado y legible por máquina (CSV/JSON).",
          ]}
        />
        <InfoBox>
          Ejerce tus derechos gratuitamente en nuestro{" "}
          <Link href="/arco" style={{ color: "#273D88", fontWeight: 600 }}>
            Portal ARCO →
          </Link>{" "}
          Respondemos en un plazo máximo de <strong>30 días corridos</strong>{" "}
          conforme al Art. 22 Ley 21.719. También puedes escribirnos directamente a{" "}
          <a href="mailto:contacto@getpangui.com" style={{ color: "#273D88" }}>contacto@getpangui.com</a>.
        </InfoBox>
        <p>
          Si consideras que tu solicitud no fue atendida, puedes reclamar ante
          la <strong>Agencia de Protección de Datos Personales</strong> de
          Chile, cuya sede se encuentra en Santiago.
        </p>
      </LegalSection>

      {/* 6. Retención */}
      <LegalSection icon={Clock} title="7. Retención y eliminación de datos">
        <p>
          Conservamos tus datos mientras dure la relación contractual. Para
          solicitar la eliminación de tu cuenta puedes:
        </p>
        <Ul
          items={[
            "Usar el botón \"Eliminar cuenta\" desde Configuración → Cuenta dentro de la aplicación móvil o web.",
            "Enviar un correo a contacto@getpangui.com desde la dirección registrada.",
            "Ejercer el derecho de cancelación en nuestro Portal ARCO.",
          ]}
        />
        <p style={{ marginTop: 12 }}>Una vez recibida la solicitud:</p>
        <Ul
          items={[
            "Datos de perfil: eliminados en 30 días hábiles desde la solicitud.",
            "Órdenes de trabajo y materiales: retenidos hasta 5 años desde la última OT cuando sean necesarios para respaldos administrativos o contractuales.",
            "Logs de seguridad: eliminados a los 12 meses.",
            "Fotos y firmas digitales de OT: eliminadas al cumplir el plazo de retención de la OT correspondiente o cuando corresponda conforme a una solicitud válida.",
            "Caché local en tu dispositivo (SQLite, AsyncStorage, archivos): se elimina al desinstalar la aplicación o desde Configuración → Cuenta → \"Borrar datos locales\".",
          ]}
        />
      </LegalSection>

      {/* 7. Seguridad */}
      <LegalSection icon={Lock} title="8. Seguridad de los datos">
        <p>
          Implementamos medidas técnicas y organizacionales para proteger tus
          datos (Art. 25 Ley 21.719):
        </p>
        <Ul
          items={[
            "Cifrado en tránsito mediante TLS 1.3 en todas las comunicaciones.",
            "Cifrado en reposo con AES-256 en la infraestructura de Supabase/AWS.",
            "Control de acceso por roles: cada usuario solo ve los datos de su planta.",
            "Autenticación segura mediante Supabase Auth (contraseñas almacenadas con hash adaptativo, nunca en texto claro).",
            "Auditoría de cambios en OT mediante tabla auditoria_ot con trazabilidad completa.",
            "Monitoreo de accesos y alertas automáticas ante actividad inusual.",
          ]}
        />
        <p>
          En caso de brecha de seguridad que afecte tus derechos, te
          notificaremos en un plazo máximo de <strong>72 horas</strong> desde
          su detección, conforme al Art. 29 Ley 21.719.
        </p>
      </LegalSection>

      {/* 8. Cookies y almacenamiento local */}
      <LegalSection icon={Cookie} title="9. Cookies y almacenamiento local">
        <p><strong>Sitio web (pangui.cl):</strong></p>
        <Ul
          items={[
            "Cookie de sesión de Supabase Auth: identifica tu sesión autenticada. Se elimina al cerrar sesión.",
            "Cookie de preferencia de tema (localStorage): recuerda si elegiste modo claro, oscuro o sistema.",
          ]}
        />
        <p style={{ marginTop: 12 }}>
          <strong>Aplicación móvil (Android / iOS):</strong>
        </p>
        <Ul
          items={[
            "Almacenamiento seguro (AsyncStorage): tokens de sesión de Supabase Auth.",
            "Base de datos local (SQLite): copia local de tus órdenes de trabajo, hojas de inventario, fotos y procedimientos para soporte de modo sin conexión. Solo contiene los datos a los que tu cuenta tiene acceso.",
            "Caché de archivos: fotos pendientes de subida y exportaciones temporales (PDF/CSV) en el directorio de la app.",
            "Token push de Expo (si autorizas notificaciones): se asocia a tu cuenta para enviarte alertas.",
          ]}
        />
        <p>
          <strong>No usamos cookies de seguimiento publicitario</strong> ni
          terceros con fines de marketing. No hay píxeles de Facebook, Google
          Ads u otros trackers en la plataforma de gestión ni en la app móvil.
        </p>
      </LegalSection>

      {/* 9. Menores */}
      <LegalSection icon={Baby} title="10. Menores de edad">
        <p>
          Pangui es una plataforma B2B exclusivamente para empresas y
          profesionales. <strong>No está dirigida a menores de 18 años</strong>{" "}
          y no recolectamos intencionalmente datos de menores. Si detectamos que
          un usuario es menor de edad, procederemos a eliminar su cuenta.
        </p>
      </LegalSection>

      {/* 10. Cambios */}
      <LegalSection icon={RefreshCw} title="11. Cambios a esta política">
        <p>
          Podemos actualizar esta política cuando lo requiera la ley o el
          servicio. Te notificaremos por correo electrónico con al menos{" "}
          <strong>15 días de anticipación</strong> antes de que entren en vigor
          cambios sustanciales. El uso continuado del servicio después de ese
          plazo implica aceptación.
        </p>
        <p>
          Siempre podrás consultar la versión vigente en{" "}
          <Link href="/privacidad" style={{ color: "var(--accent-1)" }}>
            pangui.cl/privacidad
          </Link>
          .
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
        <strong>Última actualización: 18 de mayo de 2026.</strong> Este documento
        tiene carácter informativo y no reemplaza asesoría legal profesional.
        Recomendamos consultar con un abogado especialista en protección de
        datos para situaciones específicas de tu empresa.
      </motion.div>
    </LegalLayout>
  );
}
