"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import BuscadorMaterial from "@/components/BuscadorMaterial";
import styles from "./page.module.css";

function stockColor(actual, minimo) {
  if (Number(actual) <= 0)    return "rojo";
  if (minimo <= 0)             return "verde";
  const r = Number(actual) / Number(minimo);
  if (r < 0.2)  return "rojo";
  if (r < 1)    return "amarillo";
  return "verde";
}

function StockBar({ actual, minimo }) {
  const pct = minimo > 0 ? Math.min(100, (Number(actual) / Number(minimo)) * 100) : 100;
  const color = stockColor(actual, minimo);
  return (
    <div className={styles.barWrap}>
      <div
        className={`${styles.barFill} ${styles["bar_" + color]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function TecnicoInventarioPage() {
  const router = useRouter();
  const [plantaId, setPlantaId]   = useState(null);
  const [material, setMaterial]   = useState(null); // material seleccionado
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }
      const { data } = await supabase
        .from("usuarios")
        .select("planta_id, rol")
        .eq("id", user.id)
        .single();
      if (!data || data.rol !== "tecnico") { router.replace("/"); return; }
      setPlantaId(data.planta_id);
      setLoading(false);
    });
  }, [router]);

  function seleccionar(mat) {
    setMaterial(mat);
  }

  function volver() {
    setMaterial(null);
  }

  if (loading) {
    return (
      <>
        <div className={styles.loading}>Cargando…</div>
      </>
    );
  }

  return (
    <>
      <main className={styles.main}>
        <button className={styles.btnVolver} onClick={() => router.back()} type="button">
          ← Volver
        </button>

        <h1 className={styles.titulo}>Inventario</h1>
        <p className={styles.subtitulo}>Consulta el stock disponible antes de ir a bodega.</p>

        {!material ? (
          <>
            <BuscadorMaterial
              plantaId={plantaId}
              onSelect={seleccionar}
              placeholder="Buscar material por nombre o código…"
            />
            <p className={styles.hint}>Selecciona un material para ver su detalle.</p>
          </>
        ) : (
          <div className={styles.detalle}>
            <div className={styles.detalleTop}>
              <span className={styles.detalleNombre}>{material.nombre}</span>
              <span className={styles.detalleCodigo}>{material.codigo}</span>
            </div>

            <StockBar actual={material.stock_actual} minimo={material.stock_minimo} />

            <div className={styles.detalleStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Stock actual</span>
                <span className={`${styles.statVal} ${styles["stock_" + stockColor(material.stock_actual, material.stock_minimo)]}`}>
                  {Number(material.stock_actual)} {material.unidad}
                  {Number(material.stock_actual) <= 0 && " · SIN STOCK"}
                </span>
              </div>
              {material.stock_minimo > 0 && (
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Stock mínimo</span>
                  <span className={styles.statVal}>{Number(material.stock_minimo)} {material.unidad}</span>
                </div>
              )}
              {material.ubicacion && (
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Ubicación</span>
                  <span className={styles.statVal}>{material.ubicacion}</span>
                </div>
              )}
              {material.descripcion && (
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Descripción</span>
                  <span className={styles.statVal}>{material.descripcion}</span>
                </div>
              )}
            </div>

            {Number(material.stock_actual) <= 0 && (
              <div className={styles.alertaRojo}>
                Sin stock disponible. Solicitar reposición al jefe.
              </div>
            )}
            {Number(material.stock_actual) > 0 &&
              material.stock_minimo > 0 &&
              Number(material.stock_actual) <= Number(material.stock_minimo) && (
              <div className={styles.alertaAmarillo}>
                Stock bajo mínimo. Puede que no alcance para todos los trabajos.
              </div>
            )}

            <button className={styles.btnBuscarOtro} onClick={volver} type="button">
              ← Buscar otro material
            </button>
          </div>
        )}
      </main>
    </>
  );
}
