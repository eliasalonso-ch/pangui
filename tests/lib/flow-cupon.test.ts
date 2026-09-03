import { afterEach, describe, expect, it, vi } from "vitest";
import { cuponClienteFundador, precioEfectivo } from "@/lib/flow-cupon";

describe("precioEfectivo", () => {
  it("un cliente fundador conserva su precio negociado en cualquier tier", () => {
    expect(precioEfectivo({ is_early_customer: true, price_per_user_clp: 3990 }, 9990))
      .toEqual({ esFundador: true, precio: 3990 });
  });

  it("sin marca de fundador manda el catálogo", () => {
    expect(precioEfectivo({ is_early_customer: false, price_per_user_clp: 3990 }, 9990))
      .toEqual({ esFundador: false, precio: 9990 });
    expect(precioEfectivo(null, 6990)).toEqual({ esFundador: false, precio: 6990 });
  });

  // Un trial marcado como fundador tiene price_per_user_clp = 0: no hay precio
  // negociado que conservar, así que toma el catálogo y no adjunta cupón.
  it("fundador con precio 0 no cuenta como precio negociado", () => {
    expect(precioEfectivo({ is_early_customer: true, price_per_user_clp: 0 }, 9990))
      .toEqual({ esFundador: false, precio: 9990 });
  });
});

describe("cuponClienteFundador", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("adjunta el cupón solo a fundadores", () => {
    vi.stubEnv("FLOW_COUPON_EARLY_CUSTOMER", "42");
    expect(cuponClienteFundador(true, "ws")).toEqual({ couponId: "42" });
    expect(cuponClienteFundador(false, "ws")).toEqual({});
  });

  it("sin cupón configurado avisa y no rompe la contratación", () => {
    vi.stubEnv("FLOW_COUPON_EARLY_CUSTOMER", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(cuponClienteFundador(true, "ws")).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
  });
});
