import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Pangui — Software de órdenes de trabajo y mantenimiento para contratistas en Chile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(160deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.75)",
          }}
        >
          Software de mantención · CMMS · Chile
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.02 }}>
            Menos trabajo detenido.
          </div>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.02 }}>
            Más control sobre terreno.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700 }}>Pangui</div>
          <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.8)" }}>
            getpangui.com
          </div>
        </div>
      </div>
    ),
    size
  );
}
