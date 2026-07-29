/**
 * Crea el cupón de Flow que cubre la diferencia entre el precio de lista del
 * plan y el precio especial de un cliente fundador.
 *
 * Por qué hace falta: el plan de Flow cobra el precio de lista por el usuario
 * #1; los usuarios extra se agregan como items al precio real de la suscripción
 * (lib/flow-sync.ts). Sin cupón, un cliente fundador paga el primer usuario a
 * precio de lista y el resto al precio especial.
 *
 * El cupón se crea con:
 *   duration: 0         -> indefinida, no vence nunca
 *   amount + CLP        -> descuento de monto fijo
 *   max_redemptions: 1  -> un solo uso; no puede aplicarse a otro cliente
 *
 * Uso:
 *   npx tsx scripts/create-early-customer-coupon.ts            # dry-run
 *   npx tsx scripts/create-early-customer-coupon.ts --create   # lo crea
 *
 * Después de crearlo, copia el id a .env.local:
 *   FLOW_COUPON_EARLY_CUSTOMER=<id>
 */
import { config } from "dotenv";
import { planByKey } from "../lib/flow-plans";

// `lib/flow` lee FLOW_API_KEY / FLOW_SECRET_KEY al importarse, así que el .env
// tiene que cargarse antes. Por eso el import de flow es dinámico más abajo:
// con un import estático, Node evalúa el módulo antes de esta línea y la firma
// HMAC revienta con "key must be of type string... Received undefined".
config({ path: ".env.local" });

const LIST_PRICE = planByKey("pro").pricePerUser; // 9990
const EARLY_PRICE = 3990;
const DISCOUNT = LIST_PRICE - EARLY_PRICE;

async function main() {
  const create = process.argv.includes("--create");

  if (!process.env.FLOW_API_KEY || !process.env.FLOW_SECRET_KEY) {
    console.error("Faltan FLOW_API_KEY / FLOW_SECRET_KEY. Corré el script desde la raíz del repo (c:/dev/pangui).");
    process.exit(1);
  }

  const isProd = process.env.FLOW_ENV === "production";

  console.log("Cupón cliente fundador (plan Pro)");
  console.log(`  entorno Flow         ${isProd ? "PRODUCCIÓN (cuenta real)" : "sandbox"}`);
  console.log(`  precio de lista      $${LIST_PRICE.toLocaleString("es-CL")}`);
  console.log(`  precio fundador      $${EARLY_PRICE.toLocaleString("es-CL")}`);
  console.log(`  descuento del cupón  $${DISCOUNT.toLocaleString("es-CL")}`);
  console.log("  duración             indefinida (duration: 0)");
  console.log("  usos máximos         1");

  if (!create) {
    console.log("\nDry-run. Volvé a correr con --create para crearlo en Flow.");
    return;
  }

  const { flow } = await import("../lib/flow");

  const coupon = await flow.createCoupon({
    name:            `Cliente fundador · Pro $${EARLY_PRICE}`,
    amount:          DISCOUNT,
    currency:        "CLP",
    duration:        0,
    max_redemptions: 1,
  });

  console.log(`\n✓ Cupón creado. id = ${coupon.id}`);
  console.log("\nAgregá esto a .env.local (y a las variables de entorno de producción):");
  console.log(`  FLOW_COUPON_EARLY_CUSTOMER=${coupon.id}`);
}

main().catch((err) => {
  console.error("Falló la creación del cupón:", err);
  process.exit(1);
});
