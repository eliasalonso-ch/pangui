"use client";

import { useState } from "react";

// Contratos de clientes Empresa (cobrados fuera de Flow) y los datos bancarios
// de Pangui que ven los que pagan por transferencia. El owner de cada
// workspace lo ve en Configuración → Suscripción.

const CONTRATO_VACIO = {
  precio: "", moneda: "UF", periodicidad: "mensual", forma_pago: "transferencia",
  usuarios_contratados: "", inicio: "", fin: "", notas: "",
};

const CAMPOS_BANCO = [
  ["titular", "Titular"],
  ["rut", "RUT"],
  ["banco", "Banco"],
  ["tipo_cuenta", "Tipo de cuenta"],
  ["numero_cuenta", "N° de cuenta"],
  ["email_comprobantes", "Email para comprobantes"],
];

async function guardar(body) {
  const res = await fetch("/api/superadmin", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
}

/** null → "" para que los inputs queden controlados. */
function aForm(obj, vacio) {
  const out = { ...vacio };
  for (const k of Object.keys(vacio)) if (obj?.[k] != null) out[k] = String(obj[k]);
  return out;
}

export default function ContratosTab({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FormBanco inicial={data.transferencia} />
      <p style={s.count}>
        {data.workspaces.length} workspaces en Empresa. Para sumar uno, pasa su suscripción a plan_key = enterprise.
      </p>
      {data.workspaces.map((w) => (
        <FormContrato key={w.workspace_id} ws={w} />
      ))}
    </div>
  );
}

function FormContrato({ ws }) {
  const [f, setF] = useState(() => aForm(ws.contrato, CONTRATO_VACIO));
  // Sin contrato cargado se asume activo (igual que el default de la tabla).
  const [activo, setActivo] = useState(ws.contrato?.activo ?? true);
  const [estado, setEstado] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function enviar(activoNuevo) {
    setEstado("Guardando…");
    try {
      await guardar({ tipo: "contrato", workspace_id: ws.workspace_id, ...f, activo: activoNuevo });
      setActivo(activoNuevo);
      setEstado("Guardado");
    } catch (err) {
      setEstado(err.message);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    enviar(activo);
  }

  return (
    <form onSubmit={onSubmit} style={s.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={s.title}>{ws.nombre}{!ws.contrato && <span style={s.muted}> · sin contrato cargado</span>}</h3>
          <UsuariosCobrables actuales={ws.usuarios_cobrables} contratados={Number(f.usuarios_contratados) || null} />
        </div>
        {/* Se guarda al instante, con el resto del formulario tal como está. */}
        <button
          type="button"
          onClick={() => enviar(!activo)}
          style={{ ...s.toggle, ...(activo ? s.toggleOn : s.toggleOff) }}
          aria-pressed={activo}
        >
          {activo ? "● Contrato activo" : "○ Contrato inactivo"}
        </button>
      </div>
      <div style={s.grid}>
        <Campo label="Precio (sin IVA)">
          <input type="number" min="0" step="0.01" value={f.precio} onChange={set("precio")} style={s.input} />
        </Campo>
        <Campo label="Moneda">
          <select value={f.moneda} onChange={set("moneda")} style={s.input}>
            <option value="UF">UF</option>
            <option value="CLP">CLP</option>
          </select>
        </Campo>
        <Campo label="Se cobra">
          <select value={f.periodicidad} onChange={set("periodicidad")} style={s.input}>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Campo>
        <Campo label="Forma de pago">
          <select value={f.forma_pago} onChange={set("forma_pago")} style={s.input}>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </Campo>
        <Campo label="Usuarios contratados">
          <input type="number" min="1" step="1" value={f.usuarios_contratados} onChange={set("usuarios_contratados")} style={s.input} />
        </Campo>
        <Campo label="Inicio">
          <input type="date" value={f.inicio} onChange={set("inicio")} style={s.input} />
        </Campo>
        <Campo label="Término">
          <input type="date" value={f.fin} onChange={set("fin")} style={s.input} />
        </Campo>
      </div>
      <Campo label="Notas (las ve el cliente)">
        <textarea rows={2} value={f.notas} onChange={set("notas")} style={{ ...s.input, resize: "vertical" }} />
      </Campo>
      <Guardar estado={estado} />
    </form>
  );
}

function FormBanco({ inicial }) {
  const vacio = Object.fromEntries(CAMPOS_BANCO.map(([k]) => [k, ""]));
  const [f, setF] = useState(() => aForm(inicial, vacio));
  const [estado, setEstado] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setEstado("Guardando…");
    try {
      await guardar({ tipo: "transferencia", ...f });
      setEstado("Guardado");
    } catch (err) {
      setEstado(err.message);
    }
  }

  return (
    <form onSubmit={onSubmit} style={s.card}>
      <h3 style={s.title}>Datos para transferencia <span style={s.muted}>· los ven los clientes que pagan por transferencia</span></h3>
      <div style={s.grid}>
        {CAMPOS_BANCO.map(([k, label]) => (
          <Campo key={k} label={label}>
            <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={s.input} />
          </Campo>
        ))}
      </div>
      <Guardar estado={estado} />
    </form>
  );
}

/** Conteo para el próximo cobro: activos, sin solicitantes ni staff excluido. */
function UsuariosCobrables({ actuales, contratados }) {
  const exceso = contratados ? actuales - contratados : 0;
  return (
    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
      <strong>{actuales}</strong> {actuales === 1 ? "usuario facturable" : "usuarios facturables"} hoy
      {contratados ? ` · ${contratados} contratados` : ""}
      {exceso > 0 && <span style={{ color: "#b91c1c", fontWeight: 600 }}> · {exceso} sobre lo contratado</span>}
    </p>
  );
}

function Campo({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
      {label}
      {children}
    </label>
  );
}

function Guardar({ estado }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
      <button type="submit" style={s.btn}>Guardar</button>
      {estado && <span style={{ fontSize: 13, color: "#6b7280" }}>{estado}</span>}
    </div>
  );
}

const s = {
  card: { background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 12 },
  title: { fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 },
  muted: { fontWeight: 400, color: "#9ca3af", fontSize: 13 },
  count: { fontSize: 13, color: "#6b7280", margin: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 },
  input: { fontSize: 14, fontWeight: 400, color: "#111827", padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", fontFamily: "inherit" },
  toggle: { fontSize: 13, fontWeight: 600, borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", border: "1px solid" },
  toggleOn: { color: "#166534", background: "#dcfce7", borderColor: "#86efac" },
  toggleOff: { color: "#6b7280", background: "#f3f4f6", borderColor: "#d1d5db" },
  btn: { fontSize: 13, fontWeight: 600, color: "#fff", background: "#273d88", border: "none", borderRadius: 4, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" },
};
