/* global React */
// Pangui v2 — Órdenes screen

const { useState } = React;

// ============ OT Row ============
window.OTRow = function OTRow({ o, selected, onClick }) {
  return (
    <div className={"ot " + (selected ? "selected" : "")} onClick={onClick}>
      <div className="ot-top">
        <span className="ot-code">{o.code}</span>
        {o.overdue && (
          <span className="ot-overdue">
            <Ic n="alert-triangle"/>
            Venció hace {o.overdue}
          </span>
        )}
      </div>
      <p className="ot-title">{o.title}</p>
      <div className="ot-bot">
        <div className="ot-meta">
          <StatusPill s={o.status}/>
          <PriorityPill p={o.priority}/>
          {o.location && (
            <span className="ot-loc"><Ic n="map-pin"/>{o.location}</span>
          )}
        </div>
        <div className="ot-right">
          <span className="ot-time">{o.ago}</span>
          <AvatarStack people={o.assignees} size="sm" max={3}/>
        </div>
      </div>
    </div>
  );
};

// ============ Detail panel ============
window.OTDetail = function OTDetail({ o }) {
  if (!o) {
    return (
      <Empty
        icon="clipboard-list"
        title="Selecciona una orden"
        sub="Elige una OT de la lista para ver los detalles, asignar técnicos y registrar avance."
      />
    );
  }
  return (
    <div className="detail-shell">
      <div className="detail-head">
        <div>
          <span className="ot-code">{o.code}</span>
          <div className="detail-title">{o.title}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" icon="pencil">Editar</Btn>
          <Btn variant="primary" icon="play">Iniciar</Btn>
        </div>
      </div>

      <div className="card stack-6" style={{ padding: "var(--sp-5)" }}>
        <div className="detail-meta-grid">
          <div>
            <div className="meta-label">Estado</div>
            <div className="meta-value"><StatusPill s={o.status}/></div>
          </div>
          <div>
            <div className="meta-label">Prioridad</div>
            <div className="meta-value"><PriorityPill p={o.priority}/></div>
          </div>
          <div>
            <div className="meta-label">Asignado a</div>
            <div className="meta-value">
              <AvatarStack people={o.assignees} size="sm" max={4}/>
              <span className="fg2" style={{ fontSize: "var(--fs-sm)" }}>{o.assignees.map(a=>a.name).join(", ")}</span>
            </div>
          </div>
          <div>
            <div className="meta-label">Ubicación</div>
            <div className="meta-value">
              <Ic n="map-pin" style={{ color: "var(--fg-3)" }}/>
              {o.location}
            </div>
          </div>
          <div>
            <div className="meta-label">Vencimiento</div>
            <div className="meta-value" style={{ color: o.overdue ? "var(--danger)" : "var(--fg-1)" }}>
              <Ic n="clock"/>
              {o.overdue ? `Venció hace ${o.overdue}` : "Mañana 14:00"}
            </div>
          </div>
          <div>
            <div className="meta-label">Categoría</div>
            <div className="meta-value fg2">Mantención correctiva</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="left">
            <div className="h">Descripción</div>
          </div>
        </div>
        <p style={{ margin: 0, color: "var(--fg-2)", lineHeight: 1.55, fontSize: "var(--fs-base)" }}>
          Bomba hidráulica N°3 presenta pérdida de presión intermitente. Se requiere revisión del sistema
          de sellado y posible cambio de empaquetaduras. Operador reporta ruido anormal desde el jueves 12.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="left">
            <div className="h">Checklist</div>
            <div className="s">2 de 5 completados</div>
          </div>
        </div>
        <div className="checklist">
          <div className="checklist-item done"><span className="check"><Ic n="check"/></span>Desmontar carcasa y tomar fotos</div>
          <div className="checklist-item done"><span className="check"><Ic n="check"/></span>Medir presión de entrada y salida</div>
          <div className="checklist-item"><span className="check"/>Reemplazar empaquetadura principal</div>
          <div className="checklist-item"><span className="check"/>Prueba de estanqueidad 30 min</div>
          <div className="checklist-item"><span className="check"/>Fotos finales + firma supervisor</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="left"><div className="h">Partes usadas</div></div>
          <Btn variant="ghost" sm icon="plus">Agregar</Btn>
        </div>
        <div className="part-row">
          <div>
            <div style={{ fontWeight: 600 }}>Empaquetadura hidráulica 50mm</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>HDR-EMP-050</div>
          </div>
          <span className="text-mono fg2">× 2</span>
          <span className="text-mono" style={{ textAlign: "right", fontWeight: 600 }}>$12.400</span>
        </div>
        <div className="part-row">
          <div>
            <div style={{ fontWeight: 600 }}>Aceite hidráulico ISO 68 · 5L</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>OIL-ISO-68</div>
          </div>
          <span className="text-mono fg2">× 1</span>
          <span className="text-mono" style={{ textAlign: "right", fontWeight: 600 }}>$8.900</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, marginBottom: 32 }}>
        <div className="card-head">
          <div className="left"><div className="h">Actividad</div></div>
        </div>
        <div className="activity">
          <div className="activity-row">
            <Avatar ini="CS" color="#273D88" size="sm"/>
            <div><b>Carlos S.</b> marcó "Medir presión" como completado · <span className="fg3">hace 32 min</span></div>
          </div>
          <div className="activity-row">
            <Avatar ini="MR" color="#7C3AED" size="sm"/>
            <div><b>Marta R.</b> subió 3 fotos · <span className="fg3">hace 1h</span></div>
          </div>
          <div className="activity-row">
            <Avatar ini="JP" color="#15803D" size="sm"/>
            <div><b>Jefe</b> cambió prioridad a <b>Urgente</b> · <span className="fg3">hace 3h</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ Orders screen ============
window.Ordenes = function Ordenes({ theme, onTheme }) {
  const [sel, setSel] = useState(ORDERS[0]);
  const [tab, setTab] = useState("todas");
  return (
    <div className="main">
      <Topbar
        title="Órdenes"
        sub={`${ORDERS.length} órdenes · 3 vencidas`}
        theme={theme}
        onTheme={onTheme}
        actions={<>
          <Btn variant="secondary" icon="filter">Filtros</Btn>
          <Btn variant="secondary" icon="download">Exportar</Btn>
          <Btn variant="primary" icon="plus">Nueva OT</Btn>
        </>}
      />
      <div className="tabs">
        {[
          ["todas",    "Todas",     ORDERS.length],
          ["mias",     "Mías",      3],
          ["vencidas", "Vencidas",  1],
          ["cerradas", "Cerradas",  2],
        ].map(([k,l,n]) => (
          <button key={k} className={"tab " + (tab===k?"active":"")} onClick={()=>setTab(k)}>
            {l}<span className="count">{n}</span>
          </button>
        ))}
      </div>
      <div className="page-body wide">
        <div className="split">
          <div className="split-list">
            <div className="list-controls">
              <Search placeholder="Buscar OT, ubicación, técnico…" kbd="/"/>
              <IconBtn icon="sliders-horizontal" title="Filtros avanzados"/>
              <IconBtn icon="arrow-up-down" title="Ordenar"/>
            </div>
            <div className="list-rows">
              {ORDERS.map(o => (
                <OTRow key={o.id} o={o} selected={sel?.id===o.id} onClick={()=>setSel(o)}/>
              ))}
            </div>
          </div>
          <div className="split-detail">
            <OTDetail o={sel}/>
          </div>
        </div>
      </div>
    </div>
  );
};
