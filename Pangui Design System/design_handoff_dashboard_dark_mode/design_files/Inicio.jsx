/* global React */
// Pangui v2 — Screens (Inicio, Órdenes, Partes, Equipo, Configuración, Notificaciones)

const { useState, useMemo } = React;

// ============ DEMO DATA ============
const ORDERS = [
  { id:1, code:"OT-00042", title:"Reparar bomba hidráulica — Edificio Central Torre B", status:"curso",     priority:"urgente", location:"Torre B · Sala de máquinas", ago:"3h",   overdue:"2d", assignees:[{ini:"CS",color:"#273D88",name:"Carlos S."},{ini:"MR",color:"#7C3AED",name:"Marta R."}] },
  { id:2, code:"OT-00043", title:"Inspección preventiva aire acondicionado piso 4",       status:"abierta",   priority:"media",   location:"Oficinas · Piso 4",         ago:"12m",  assignees:[{ini:"RM",color:"#0EA5E9",name:"Rodrigo M."}] },
  { id:3, code:"OT-00044", title:"Cambio de filtros extractores cocina industrial",       status:"espera",    priority:"alta",    location:"Cocina planta",             ago:"1h",   assignees:[{ini:"CS",color:"#273D88",name:"Carlos S."}] },
  { id:4, code:"OT-00045", title:"Revisar fuga de agua baño damas — urgente",             status:"revision",  priority:"alta",    location:"Baño P2",                   ago:"22m",  assignees:[{ini:"MR",color:"#7C3AED",name:"Marta R."},{ini:"CS",color:"#273D88",name:"Carlos S."},{ini:"RM",color:"#0EA5E9",name:"Rodrigo M."},{ini:"JP",color:"#15803D",name:"Javier P."}] },
  { id:5, code:"OT-00046", title:"Mantención mensual grupo electrógeno",                  status:"abierta",   priority:"baja",    location:"Sala eléctrica",            ago:"5h",   assignees:[{ini:"RM",color:"#0EA5E9",name:"Rodrigo M."},{ini:"JP",color:"#15803D",name:"Javier P."}] },
  { id:6, code:"OT-00047", title:"Pintar pasillo acceso principal (post inspección)",      status:"completada",priority:"baja",    location:"Pasillo acceso",            ago:"ayer", assignees:[{ini:"MR",color:"#7C3AED",name:"Marta R."}] },
  { id:7, code:"OT-00041", title:"Reparación puerta automática — no responde",            status:"cancelada", priority:"media",   location:"Ingreso norte",             ago:"2d",   assignees:[{ini:"CS",color:"#273D88",name:"Carlos S."}] },
];

// ============ Inicio (Dashboard) ============
window.Inicio = function Inicio({ onGoOrdenes, theme, onTheme }) {
  const kpis = [
    { label:"Abiertas",     val:12, delta:"+3 hoy",       deltaDir:"up",   tone:"brand" },
    { label:"En curso",     val:8,  delta:"2 urgentes",   deltaDir:"flat" },
    { label:"Vencidas",     val:3,  delta:"−1 vs ayer",   deltaDir:"down" },
    { label:"Completadas",  val:47, delta:"+12 semana",   deltaDir:"up" },
  ];
  const stock = [
    { n:"Empaquetadura hidráulica 50mm", sku:"HDR-EMP-050", qty:2, min:10 },
    { n:"Aceite hidráulico ISO 68 · 5L", sku:"OIL-ISO-68",  qty:6, min:8  },
    { n:"Filtro extractor industrial",   sku:"FLT-EXT-XL",  qty:1, min:4  },
  ];
  const recent = ORDERS.slice(0,4);

  return (
    <div className="main">
      <Topbar
        title="Inicio"
        sub="Mantenciones Norte · Lunes 17 de mayo"
        theme={theme}
        onTheme={onTheme}
        actions={<>
          <Btn variant="secondary" icon="download">Exportar</Btn>
          <Btn variant="primary" icon="plus" onClick={onGoOrdenes}>Nueva OT</Btn>
        </>}
      />
      <div className="page-body">
        <div style={{ maxWidth: 1200, marginInline: "auto" }}>
          {/* KPIs */}
          <div className="kpis">
            {kpis.map(k => (
              <div key={k.label} className={"kpi" + (k.tone === "brand" ? " brand" : "")}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-val">{k.val}</div>
                <div className={"kpi-delta " + (k.deltaDir === "up" ? "up" : k.deltaDir === "down" ? "down" : "")}>
                  {k.deltaDir === "up" && <Ic n="trending-up" />}
                  {k.deltaDir === "down" && <Ic n="trending-down" />}
                  {k.delta}
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Stock */}
          <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap: 16, marginTop: 16 }}>
            {/* Chart */}
            <div className="card">
              <div className="card-head">
                <div className="left">
                  <div className="h">Órdenes por día</div>
                  <div className="s">Últimos 30 días</div>
                </div>
                <div className="chart-tabs">
                  <button className="chart-tab">14d</button>
                  <button className="chart-tab active">30d</button>
                  <button className="chart-tab">90d</button>
                </div>
              </div>
              <svg viewBox="0 0 720 180" style={{ width: "100%", height: 180 }}>
                <defs>
                  <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.32"/>
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {[0,1,2,3].map(i => (
                  <line key={i} x1="0" y1={20 + i * 45} x2="720" y2={20 + i * 45}
                    stroke="var(--divider)" strokeWidth="1"/>
                ))}
                {(() => {
                  const pts = [8,12,6,10,15,9,11,14,7,13,10,16,11,13,9,12,15,8,14,11,16,13,10,12,15,14,11,17,13,15];
                  const max = 18, step = 720/(pts.length-1);
                  const path = pts.map((v,i) => `${i===0?"M":"L"}${i*step},${170-(v/max)*150}`).join(" ");
                  const area = path + ` L 720,170 L 0,170 Z`;
                  return (<>
                    <path d={area} fill="url(#dashGrad)"/>
                    <path d={path} stroke="var(--brand)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
                    {pts.map((v,i) => (<circle key={i} cx={i*step} cy={170-(v/max)*150} r="3" fill="var(--brand)"/>))}
                  </>);
                })()}
              </svg>
            </div>

            {/* Stock crítico */}
            <div className="card">
              <div className="card-head">
                <div className="left">
                  <div className="h">Stock crítico</div>
                  <div className="s">{stock.length} partes bajo el mínimo</div>
                </div>
                <Btn variant="ghost" sm>Ver todas</Btn>
              </div>
              {stock.map(s => (
                <div key={s.sku} className="dash-row" style={{ gridTemplateColumns: "8px 1fr auto" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)" }}/>
                  <div>
                    <div style={{ fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--fg-1)" }}>{s.n}</div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{s.sku}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="text-mono" style={{ fontSize: "var(--fs-md)", fontWeight: 700, color: "var(--danger)" }}>{s.qty}</div>
                    <div style={{ fontSize: "var(--fs-2xs)", color: "var(--fg-3)" }}>mín {s.min}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="left">
                <div className="h">Actividad reciente</div>
                <div className="s">Últimas 4 órdenes</div>
              </div>
              <Btn variant="ghost" sm iconRight="arrow-right" onClick={onGoOrdenes}>Ver todas</Btn>
            </div>
            {recent.map(o => (
              <div key={o.code} className="dash-row">
                <span className="text-mono fg-brand" style={{ fontWeight: 600 }}>{o.code}</span>
                <div style={{ fontSize: "var(--fs-base)", fontWeight: 500, color: "var(--fg-1)" }}>{o.title}</div>
                <StatusPill s={o.status}/>
                <Avatar ini={o.assignees[0].ini} color={o.assignees[0].color} size="sm"/>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--fg-4)", width: 50, textAlign: "right" }}>{o.ago}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
