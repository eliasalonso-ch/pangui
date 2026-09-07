"use client";

import LegalLayout, { LegalSection, fadeUp } from "@/components/LegalLayout";
import { motion } from "framer-motion";
import Link from "next/link";
import { Smartphone, Building2, Mail, Trash2, Archive, Clock } from "lucide-react";

const CONTACTO = "contacto@getpangui.com";
const MAILTO = `mailto:${CONTACTO}?subject=${encodeURIComponent(
  "Solicitud de eliminación de cuenta"
)}`;

/** Lista con bullet brand, alineada con /privacidad y /terminos. */
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
            lineHeight: 1.6,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              marginTop: 8,
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Paso numerado del procedimiento. */
function Paso({ n, children }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 12,
        lineHeight: 1.65,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          background: "var(--accent)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function EliminarCuentaPage() {
  return (
    <LegalLayout
      title="Eliminar tu cuenta y tus datos"
      description="Cómo solicitar la eliminación de tu cuenta de Pangui y de los datos personales asociados a ella."
    >
      <motion.div variants={fadeUp} style={{ marginBottom: 8 }}>
        <p style={{ color: "var(--ink-2)", lineHeight: 1.7, margin: 0 }}>
          Esta página explica cómo solicitar la eliminación de tu cuenta de{" "}
          <strong>Pangui</strong> (aplicación Android <code>com.pangui.app</code> y
          plataforma web) y de los datos personales asociados. El procedimiento es
          gratuito. Puedes salir de tu organización al instante desde la propia
          aplicación, y solicitar la eliminación de tus datos personales desde la app
          o por correo electrónico.
        </p>
      </motion.div>

      <LegalSection icon={Smartphone} title="Desde la aplicación móvil">
        <p style={{ margin: "0 0 12px 0" }}>
          Para <strong>salir de tu organización</strong> y dar de baja tu acceso al
          instante:
        </p>
        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          <Paso n={1}>Abre Pangui e inicia sesión con tu cuenta.</Paso>
          <Paso n={2}>
            Entra al menú <strong>Más</strong> y luego a <strong>Mi cuenta</strong>.
          </Paso>
          <Paso n={3}>
            Pulsa <strong>Abandonar organización</strong>. Si tienes órdenes de trabajo
            abiertas, elige a quién reasignarlas; si eres el titular, primero traspasa
            la propiedad a otra persona.
          </Paso>
          <Paso n={4}>Confirma. Tu acceso se da de baja de inmediato.</Paso>
        </ol>
        <p style={{ margin: "12px 0 0 0" }}>
          Para <strong>eliminar la cuenta y tus datos personales</strong>, pulsa{" "}
          <strong>Eliminar cuenta</strong> al final de esa misma pantalla y envía la
          solicitud desde la dirección asociada a tu cuenta.
        </p>
      </LegalSection>

      <LegalSection icon={Building2} title="Desde la plataforma web">
        <p style={{ margin: "0 0 12px 0" }}>
          En <strong>Configuración</strong> encuentras las mismas salidas, más la
          eliminación completa de la organización:
        </p>
        <Ul
          items={[
            "Abandonar la organización, reasignando el trabajo abierto que tengas a otra persona.",
            "Traspasar la propiedad del espacio de trabajo, si eres el titular.",
            "Eliminar el espacio de trabajo completo con todas sus órdenes de trabajo, activos y cuentas. Requiere tu contraseña y cancela la suscripción automáticamente.",
          ]}
        />
        <p style={{ margin: "12px 0 0 0" }}>
          El borrado del espacio de trabajo es definitivo y no está disponible desde la
          aplicación móvil, para evitar que ocurra por accidente.
        </p>
      </LegalSection>

      <LegalSection icon={Mail} title="Por correo electrónico">
        <p style={{ margin: "0 0 12px 0" }}>
          Si no tienes la aplicación instalada o no puedes iniciar sesión, escribe a{" "}
          <a
            href={MAILTO}
            style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "underline" }}
          >
            {CONTACTO}
          </a>{" "}
          desde la dirección de correo de tu cuenta, con el asunto{" "}
          <em>&laquo;Solicitud de eliminación de cuenta&raquo;</em>.
        </p>
        <p style={{ margin: 0 }}>
          Para verificar tu identidad podemos pedirte que confirmes la solicitud desde
          esa misma dirección. No solicitamos contraseñas en ningún caso.
        </p>
      </LegalSection>

      <LegalSection icon={Trash2} title="Qué datos se eliminan">
        <p style={{ margin: "0 0 8px 0" }}>
          Al procesar tu solicitud eliminamos de forma permanente:
        </p>
        <Ul
          items={[
            "Tu cuenta de acceso y sus credenciales de autenticación.",
            "Tu perfil: nombre, correo electrónico, teléfono, cargo y fotografía.",
            "Tus preferencias, sesiones activas y tokens de notificaciones push.",
            "Los archivos y fotografías que hayas subido y que no formen parte del registro de trabajo de tu organización.",
            "Los datos de uso asociados a tu identificador personal.",
          ]}
        />
      </LegalSection>

      <LegalSection icon={Archive} title="Qué se conserva y por qué">
        <p style={{ margin: "0 0 8px 0" }}>
          Pangui es una herramienta de trabajo en equipo: las órdenes de trabajo y sus
          registros pertenecen a la organización que contrató el servicio, no a la cuenta
          individual. Por eso se conservan, disociados de tus datos personales:
        </p>
        <Ul
          items={[
            "Las órdenes de trabajo, comentarios y evidencias creadas dentro de la organización, que quedan atribuidas a un usuario eliminado.",
            "Los documentos tributarios y registros de facturación exigidos por la legislación chilena durante los plazos legales de conservación.",
            "Los registros de seguridad estrictamente necesarios para prevenir fraude y abuso.",
          ]}
        />
        <p style={{ margin: "12px 0 0 0" }}>
          Si eres el titular de la organización y quieres eliminar la cuenta completa
          junto con todas sus órdenes de trabajo, puedes hacerlo tú mismo desde{" "}
          <strong>Configuración</strong> en la plataforma web, o indicarlo expresamente
          en tu solicitud por correo.
        </p>
      </LegalSection>

      <LegalSection icon={Clock} title="Plazos">
        <Ul
          items={[
            "Confirmamos la recepción de tu solicitud dentro de los 5 días hábiles siguientes.",
            "Completamos la eliminación en un plazo máximo de 30 días corridos, conforme al Art. 22 de la Ley 21.719 de Protección de Datos Personales.",
            "Las copias de respaldo que puedan contener tus datos se sobrescriben en el ciclo normal de retención, dentro de los 90 días siguientes.",
          ]}
        />
        <p style={{ margin: "16px 0 0 0" }}>
          Puedes revisar el tratamiento completo de tus datos y el ejercicio del resto de
          tus derechos en la{" "}
          <Link
            href="/privacidad"
            style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "underline" }}
          >
            Política de Privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
