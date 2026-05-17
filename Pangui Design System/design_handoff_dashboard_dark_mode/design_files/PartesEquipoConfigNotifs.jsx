/* global React */
// Pangui v2 — Partes, Equipo, Configuración, Notificaciones

const { useState } = React;

// ============ Partes ============
window.Partes = function Partes({ theme, onTheme }) {
  const all = [
    { sku:"HDR-EMP-050", n:"Empaquetadura hidráulica 50mm",     cat:"Hidráulica",  qty:2,  min:10, price:6200,  st:"crit" },
    { sku:"OIL-ISO-68",  n:"Aceite hidráulico ISO 68 · 5L",     cat:"Lubricantes", qty:6,  min:8,  price:8900,  st:"low"  },
    { sku:"FLT-EXT-XL",  n:"Filtro extractor industrial XL",    cat:"Filtros",     qty:1,  min:4,  price:15400, st:"crit" },
    { sku:"BRG-6205",    n:"Rodamiento 6205 2RS",               cat:"Rodamientos", qty:24, min:12, price:3200,  st:"ok"   },
    { sku:"BLT-M10-50",  n:"Perno hexagonal M10×50 · caja 50",  cat:"Fijaciones",  qty:8,  min:4,  price:12500, st:"ok"   },
    { sku:"CBL-3X25",    n:"Cable eléctrico 3×2.5 · rollo 100m",cat:"Eléctrico",   qty:12, min:6,  price:38500, st:"ok"   },
    { sku:"GSK-110",     n:"Empaquetadura reforzada 110mm",     cat:"Hidráulica",  qty:3,  min:5,  price:4200,  st:"low"  },
    { sku:"TUB-32",      n:"Tubería PVC 32mm · tira 6m",        cat:"Plomería",    qty:40, min:10, price:6900,  st:"ok"   },
  ];
  const stBadge = {
    crit: { c:"status-cancel", l:"Crítico",   color:"var(--danger)",  bg:"var(--danger-bg)" },
    low:  { c:"status-cancel", l:"Bajo",      color:"var(--warning)", bg:"var(--warning-bg)" },
    ok:   { c:"status-done",   l:"OK",        color:"var(--success)", bg:"var(--success-bg)" },
  };
  const cats = ["Todas","Hidráulica","Lubricantes","Filtros","Rodamientos","Fijaciones","Eléctrico","Plomería"];
  const [cat, setCat] = useState("Todas");
  const rows = cat==="Todas" ? all : all.filter(p => p.cat===cat);
  const crit = all.filter(p => p.st !== "ok").length;

  return (
    <div className="main">
      <Topbar
        title="Partes"
        sub={`${all.length} items en inventario · ${crit} requieren atención`}
        theme={theme} onTheme={onTheme}
        actions={<>
          <Btn variant="secondary" icon="arrow-up-down">Movimientos</Btn>
          <Btn variant="secondary" icon="download">Exportar</Btn>
          <Btn variant="primary" icon="plus">Nueva parte</Btn>
        </>}
      />
      <div className="page-body">
        <div style={{ maxWidth: 1200, marginInline: "auto" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}><Search placeholder="Buscar por nombre, SKU o categoría…" kbd="/"/></div>
            <Btn variant="secondary" icon="filter">Filtros</Btn>
          </div>

          {/* Category chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {cats.map(c => (
              <button key={c}
                onClick={() => setCat(c)}
                style={{
                  border: cat===c ? "1px solid var(--brand)" : "1px solid var(--border)",
                  background: cat===c ? "var(--brand)" : "var(--surface-1)",
                  color: cat===c ? "var(--fg-on-brand)" : "var(--fg-2)",
                  borderRadius: "var(--r-pill)",
                  padding: "6px 14px",
                  fontSize: "var(--fs-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background var(--dur-fast) var(--ease)",
                }}>
                {c}
              </button>
            ))}
          </div>

          <div className="card card-pad-0" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: "right" }}>Stock</th>
                  <th style={{ textAlign: "right" }}>Mínimo</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Precio</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const b = stBadge[p.st];
                  return (
                    <tr key={p.sku}>
                      <td><span className="mono">{p.sku}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.n}</td>
                      <td className="fg2">{p.cat}</td>
                      <td className="num" style={{ color: p.st==="crit" ? "var(--danger)" : p.st==="low" ? "var(--warning)" : "var(--fg-1)" }}>{p.qty}</td>
                      <td className="num fg3">{p.min}</td>
                      <td>
                        <span className="pill" style={{ background: b.bg, color: b.color }}>{b.l}</span>
                      </td>
                      <td className="num">${p.price.toLocaleString("es-CL")}</td>
                      <td className="actions"><IconBtn icon="more-horizontal" sm/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Equipo ============
window.Equipo = function Equipo({ theme, onTheme }) {
  const team = [
    { n:"Carlos Sepúlveda", rol:"Administrador",       ini:"CS", col:"#273D88", activos:3, cerradas:47,  disp:"office"  },
    { n:"Marta Rojas",      rol:"Jefe de operaciones", ini:"MR", col:"#7C3AED", activos:5, cerradas:62,  disp:"office"  },
    { n:"Rodrigo Muñoz",    rol:"Técnico senior",      ini:"RM", col:"#0EA5E9", activos:4, cerradas:118, disp:"field"   },
    { n:"Javier Parra",     rol:"Técnico",             ini:"JP", col:"#15803D", activos:2, cerradas:34,  disp:"field"   },
    { n:"Sofía Vera",       rol:"Supervisora",         ini:"SV", col:"#C2410C", activos:3, cerradas:55,  disp:"absent"  },
    { n:"Diego Ortiz",      rol:"Técnico",             ini:"DO", col:"#DB2777", activos:1, cerradas:18,  disp:"office"  },
  ];
  const disp = {
    office: { c:"var(--success)", l:"En oficina" },
    field:  { c:"var(--st-open-dot)", l:"En terreno" },
    absent: { c:"var(--fg-4)", l:"Fuera" },
  };
  const totalAssigned = team.reduce((s,t)=>s+t.activos, 0);

  return (
    <div className="main">
      <Topbar
        title="Equipo"
        sub={`${team.length} miembros · ${totalAssigned} órdenes asignadas`}
        theme={theme} onTheme={onTheme}
        actions={<>
          <Btn variant="secondary" icon="filter">Filtrar</Btn>
          <Btn variant="primary" icon="user-plus">Invitar miembro</Btn>
        </>}
      />
      <div className="page-body">
        <div style={{ maxWidth: 1200, marginInline: "auto" }}>
          <div className="team-grid">
            {team.map(t => (
              <div key={t.n} className="team-card">
                <div className="team-head">
                  <Avatar ini={t.ini} color={t.col} size="lg"/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="team-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.n}</div>
                    <div className="team-role">{t.rol}</div>
                  </div>
                  <span className="team-disp">
                    <span className="dot" style={{ background: disp[t.disp].c }}/>
                    {disp[t.disp].l}
                  </span>
                </div>
                <div className="team-stats">
                  <div>
                    <div className="lbl">Activas</div>
                    <div className="val brand">{t.activos}</div>
                  </div>
                  <div>
                    <div className="lbl">Cerradas mes</div>
                    <div className="val">{t.cerradas}</div>
                  </div>
                </div>
                <div className="team-actions">
                  <Btn variant="secondary" sm icon="message-circle">Mensaje</Btn>
                  <Btn variant="secondary" sm icon="external-link">Perfil</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Configuración ============
window.Configuracion = function Configuracion({ theme, onTheme, onSetTheme }) {
  const [tab, setTab] = useState("apariencia");
  const tabs = [
    { k:"cuenta",     l:"Cuenta",          ic:"user" },
    { k:"apariencia", l:"Apariencia",      ic:"palette" },
    { k:"empresa",    l:"Empresa",         ic:"building-2" },
    { k:"miembros",   l:"Equipo",          ic:"users" },
    { k:"plan",       l:"Plan y facturación", ic:"credit-card" },
    { k:"notifs",     l:"Notificaciones",  ic:"bell" },
    { k:"integraciones", l:"Integraciones", ic:"plug" },
  ];
  return (
    <div className="main">
      <Topbar
        title="Configuración"
        sub="Personaliza tu cuenta y tu equipo"
        theme={theme} onTheme={onTheme}
      />
      <div className="page-body">
        <div style={{ maxWidth: 1100, marginInline: "auto" }}>
          <div className="cfg-layout">
            <div className="cfg-nav">
              {tabs.map(t => (
                <button key={t.k}
                  className={"item " + (tab===t.k ? "active" : "")}
                  onClick={() => setTab(t.k)}>
                  <Ic n={t.ic} style={{ width: 16, height: 16 }}/>
                  {t.l}
                </button>
              ))}
            </div>
            <div className="stack-4">
              {tab === "apariencia" && (
                <>
                  <div className="cfg-section">
                    <div className="cfg-h">Apariencia</div>
                    <div className="cfg-sub">Elige cómo se ve Pangui. La opción Auto sigue el tema de tu sistema operativo.</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {[
                        { k:"light", l:"Claro",  desc:"Para ambientes con buena luz" },
                        { k:"auto",  l:"Auto",   desc:"Sigue tu sistema operativo" },
                        { k:"dark",  l:"Oscuro", desc:"Suave a la vista" },
                      ].map(opt => (
                        <button key={opt.k}
                          onClick={() => onSetTheme(opt.k)}
                          style={{
                            border: theme === opt.k ? "2px solid var(--brand)" : "1px solid var(--border)",
                            background: "var(--surface-1)",
                            borderRadius: "var(--r-md)",
                            padding: 16,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}>
                          <ThemePreview mode={opt.k}/>
                          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontWeight: 600, color: "var(--fg-1)", fontSize: "var(--fs-base)" }}>{opt.l}</div>
                              <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-3)", marginTop: 2 }}>{opt.desc}</div>
                            </div>
                            {theme === opt.k && <Ic n="check-circle-2" style={{ color: "var(--brand-fg)", width: 18, height: 18 }}/>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cfg-section">
                    <div className="cfg-h">Densidad</div>
                    <div className="cfg-sub">Qué tan compacta se ve la información.</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary">Compacta</button>
                      <button className="btn btn-primary">Cómoda (recomendada)</button>
                    </div>
                  </div>
                </>
              )}
              {tab === "cuenta" && (
                <div className="cfg-section">
                  <div className="cfg-h">Cuenta</div>
                  <div className="cfg-sub">Información personal y credenciales.</div>
                  <FormRow label="Nombre completo" value="Carlos Sepúlveda"/>
                  <FormRow label="Email" value="carlos@mantnorte.cl"/>
                  <FormRow label="Teléfono" value="+56 9 4422 1108"/>
                  <FormRow label="Idioma" value="Español (Chile)" select/>
                  <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Btn variant="ghost">Cancelar</Btn>
                    <Btn variant="primary">Guardar cambios</Btn>
                  </div>
                </div>
              )}
              {tab !== "apariencia" && tab !== "cuenta" && (
                <div className="cfg-section">
                  <div className="cfg-h">{tabs.find(t=>t.k===tab).l}</div>
                  <div className="cfg-sub">Esta sección se completa en la siguiente iteración.</div>
                  <Empty icon="construction" title="En construcción" sub="Volvemos pronto con más opciones."/>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function FormRow({ label, value, select }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      {select ? (
        <div className="searchbar" style={{ height: 40 }}>
          <input value={value} readOnly style={{ pointerEvents: "none" }}/>
          <Ic n="chevron-down"/>
        </div>
      ) : (
        <div className="searchbar" style={{ height: 40 }}>
          <input defaultValue={value}/>
        </div>
      )}
    </div>
  );
}

// Mini theme preview tile
function ThemePreview({ mode }) {
  const bg = mode === "dark" ? "#0B1220" : mode === "auto" ? "linear-gradient(90deg, #F7F8FA 0%, #F7F8FA 50%, #0B1220 50%, #0B1220 100%)" : "#F7F8FA";
  const card = mode === "dark" ? "#111A2E" : "#FFFFFF";
  const cardDark = "#111A2E";
  const txt = mode === "dark" ? "#E6EBF4" : "#1E2429";
  if (mode === "auto") {
    return (
      <div style={{ height: 60, borderRadius: 6, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--border)" }}>
        <div style={{ background: "#F7F8FA", padding: 8 }}>
          <div style={{ height: 6, width: 32, background: "#273D88", borderRadius: 2 }}/>
          <div style={{ marginTop: 6, height: 4, width: 40, background: "#E5E8EE", borderRadius: 2 }}/>
        </div>
        <div style={{ background: "#0B1220", padding: 8 }}>
          <div style={{ height: 6, width: 32, background: "#4A66C4", borderRadius: 2 }}/>
          <div style={{ marginTop: 6, height: 4, width: 40, background: "#1F2B47", borderRadius: 2 }}/>
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: 60, borderRadius: 6, background: bg, padding: 8, border: "1px solid var(--border)" }}>
      <div style={{ height: 6, width: 32, background: mode === "dark" ? "#4A66C4" : "#273D88", borderRadius: 2 }}/>
      <div style={{ marginTop: 6, height: 4, width: 40, background: mode === "dark" ? "#1F2B47" : "#E5E8EE", borderRadius: 2 }}/>
      <div style={{ marginTop: 4, height: 4, width: 28, background: mode === "dark" ? "#1F2B47" : "#E5E8EE", borderRadius: 2 }}/>
    </div>
  );
}

// ============ Notificaciones ============
window.Notificaciones = function Notificaciones({ theme, onTheme }) {
  const notifs = [
    { tone:"danger",  ic:"alert-triangle", t:"OT-00042", body:"Reparar bomba hidráulica venció hace 2 días.", time:"hace 5m", unread:true },
    { tone:"brand",   ic:"user-plus",      t:"Marta R.", body:"Te asignó la orden OT-00045 — Revisar fuga de agua.", time:"hace 22m", unread:true },
    { tone:"warning", ic:"package-x",      t:"Stock crítico", body:"Empaquetadura hidráulica 50mm bajo el mínimo (2/10).", time:"hace 1h", unread:true },
    { tone:"success", ic:"check-circle-2", t:"Rodrigo M.", body:"Completó OT-00047 — Pintar pasillo acceso principal.", time:"hace 3h" },
    { tone:"brand",   ic:"message-square", t:"Marta R.",   body:"Comentó en OT-00043: \"¿Podemos mover esta a mañana?\"", time:"hace 5h" },
    { tone:"neutral", ic:"calendar",       t:"Recordatorio", body:"Mantención preventiva grupo electrógeno · viernes 21.", time:"ayer" },
  ];
  return (
    <div className="main">
      <Topbar
        title="Notificaciones"
        sub={`${notifs.filter(n=>n.unread).length} sin leer`}
        theme={theme} onTheme={onTheme}
        actions={<>
          <Btn variant="ghost" icon="check-check">Marcar todas leídas</Btn>
          <Btn variant="secondary" icon="settings">Preferencias</Btn>
        </>}
      />
      <div className="page-body">
        <div style={{ maxWidth: 760, marginInline: "auto" }}>
          <div className="card card-pad-0">
            {notifs.map((n, i) => (
              <div key={i} className={"notif " + (n.unread ? "unread" : "")}>
                <div className={"notif-ic " + n.tone}><Ic n={n.ic}/></div>
                <div>
                  <div className="notif-title"><b>{n.t}</b> — {n.body}</div>
                </div>
                <div className="notif-time">{n.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
