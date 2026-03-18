import { NextResponse } from "next/server";
import { getToken, SF_BASE } from "./_token";

function normalizaRut(rut) {
  // Remove dots, ensure dash before last char: "20.361.535-3" or "203615353" → "20361535-3"
  let r = (rut || "").replace(/\./g, "").trim();
  if (r.length > 1 && !r.includes("-")) {
    r = r.slice(0, -1) + "-" + r.slice(-1);
  }
  return r;
}


export async function POST(request) {
  const requiredEnv = [
    "SIMPLEFACTURA_EMAIL",
    "SIMPLEFACTURA_PASSWORD",
    "SIMPLEFACTURA_RUT_EMISOR",
    "SIMPLEFACTURA_RAZON_SOCIAL",
    "SIMPLEFACTURA_GIRO",
    "SIMPLEFACTURA_ACTECO",
    "SIMPLEFACTURA_DIRECCION",
    "SIMPLEFACTURA_COMUNA",
    "SIMPLEFACTURA_CIUDAD",
  ];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Faltan variables de entorno: ${missing.join(", ")}` },
      { status: 500 }
    );
  }

  const ambiente = parseInt(process.env.SIMPLEFACTURA_AMBIENTE ?? "0", 10);

  try {
    const { billing, billingMats } = await request.json();

    if (!billing.rut_cliente?.trim())    return NextResponse.json({ error: "Falta RUT del cliente." }, { status: 400 });
    if (!billing.nombre_cliente?.trim()) return NextResponse.json({ error: "Falta razón social del cliente." }, { status: 400 });

    // Build Detalle lines
    const detalle = [];
    let lineNum = 1;

    for (const m of billingMats) {
      const precio   = parseFloat(m.precio_unitario) || 0;
      const cantidad = parseFloat(m.cantidad) || 0;
      if (precio > 0 && cantidad > 0) {
        detalle.push({
          NroLinDet: lineNum++,
          NmbItem:   m.nombre,
          QtyItem:   cantidad,
          UnmdItem:  m.unidad || "un",
          PrcItem:   precio,
          MontoItem: Math.round(precio * cantidad),
        });
      }
    }

    const manoObra = parseFloat(billing.costo_mano_obra) || 0;
    if (manoObra > 0) {
      detalle.push({
        NroLinDet: lineNum++,
        NmbItem:   "Mano de obra",
        QtyItem:   1,
        UnmdItem:  "un",
        PrcItem:   manoObra,
        MontoItem: manoObra,
      });
    }

    if (detalle.length === 0) {
      return NextResponse.json({ error: "No hay ítems con precio para facturar." }, { status: 400 });
    }

    const neto   = detalle.reduce((s, d) => s + d.MontoItem, 0);
    const aplica = billing.aplica_iva;
    const iva    = aplica ? Math.round(neto * 0.19) : 0;
    const total  = neto + iva;
    const tipoDTE = aplica ? 33 : 34;
    const hoy    = new Date().toISOString().slice(0, 10);

    const totales = aplica
      ? { MntNeto: String(neto), TasaIVA: "19", IVA: String(iva), MntTotal: String(total) }
      : { MntExe: String(neto), MntTotal: String(neto) };

    const payload = {
      Documento: {
        Encabezado: {
          IdDoc: {
            TipoDTE: tipoDTE,
            FchEmis:  hoy,
            FchVenc:  hoy,
            FmaPago:  1,
          },
          Emisor: {
            RUTEmisor:    process.env.SIMPLEFACTURA_RUT_EMISOR.trim(),
            RznSoc:       process.env.SIMPLEFACTURA_RAZON_SOCIAL.trim(),
            GiroEmis:     process.env.SIMPLEFACTURA_GIRO.trim(),
            Acteco:       [parseInt(process.env.SIMPLEFACTURA_ACTECO, 10)],
            DirOrigen:    process.env.SIMPLEFACTURA_DIRECCION.trim(),
            CmnaOrigen:   process.env.SIMPLEFACTURA_COMUNA.trim(),
            CiudadOrigen: process.env.SIMPLEFACTURA_CIUDAD.trim(),
          },
          Receptor: {
            RUTRecep:    normalizaRut(billing.rut_cliente),
            RznSocRecep: billing.nombre_cliente.trim(),
            GiroRecep:   billing.giro_cliente?.trim()      || "Sin giro",
            DirRecep:    billing.direccion_cliente?.trim() || "",
            CmnaRecep:   billing.comuna_cliente?.trim()    || "",
            CiudadRecep: billing.ciudad_cliente?.trim()    || "",
            ...(billing.email_cliente?.trim() && { CorreoRecep: billing.email_cliente.trim() }),
          },
          Totales: totales,
        },
        Detalle: detalle,
      },
    };

    console.log("[simplefactura] payload →", JSON.stringify(payload, null, 2));

    const token    = await getToken();
    const sucursal = (process.env.SIMPLEFACTURA_SUCURSAL || "Casa_Matriz").trim();

    const emitRes = await fetch(`${SF_BASE}/invoiceV2/${sucursal}`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const emitText = await emitRes.text();
    let emitBody;
    try {
      emitBody = JSON.parse(emitText);
    } catch {
      throw new Error(`SimpleFactura /invoiceV2 no devolvió JSON: ${emitText.slice(0, 300)}`);
    }

    if (!emitRes.ok || emitBody.status !== 200) {
      console.error("[simplefactura] error response →", JSON.stringify(emitBody, null, 2));
      const detail = emitBody.errors
        ? `${emitBody.message}: ${JSON.stringify(emitBody.errors)}`
        : emitBody.message || "Error al emitir DTE";
      return NextResponse.json({ error: detail }, { status: 400 });
    }

    return NextResponse.json({
      folio:   emitBody.data.folio,
      tipoDTE: emitBody.data.tipoDTE ?? tipoDTE,
      message: emitBody.message,
    });

  } catch (err) {
    console.error("[simplefactura]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
