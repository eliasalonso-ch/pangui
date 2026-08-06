import { describe, it, expect } from "vitest";
import {
  needsBulkSnapshot,
  shouldRefetchBulk,
  coalesce,
  BULK_MIN_INTERVAL_MS,
  type InFlightRef,
} from "@/app/(app)/ordenes/bulk-refresh";

const PAGE_SIZE = 300;

describe("needsBulkSnapshot", () => {
  it("no hace falta cuando la primera página vino corta: ya es el workspace completo", () => {
    expect(needsBulkSnapshot(150, PAGE_SIZE)).toBe(false);
  });

  it("hace falta cuando la primera página vino llena: puede haber página 2", () => {
    expect(needsBulkSnapshot(PAGE_SIZE, PAGE_SIZE)).toBe(true);
  });

  it("un workspace vacío no dispara el fetch caro", () => {
    expect(needsBulkSnapshot(0, PAGE_SIZE)).toBe(false);
  });
});

describe("shouldRefetchBulk", () => {
  it("siempre permite el primer fetch (lastFetchMs === 0)", () => {
    expect(shouldRefetchBulk(0, 0)).toBe(true);
    expect(shouldRefetchBulk(5_000, 0)).toBe(true);
  });

  it("bloquea dentro de la ventana de enfriamiento", () => {
    const last = 1_000_000;
    expect(shouldRefetchBulk(last + 1_000, last)).toBe(false);
    expect(shouldRefetchBulk(last + BULK_MIN_INTERVAL_MS - 1, last)).toBe(false);
  });

  it("permite justo al cumplirse el intervalo", () => {
    const last = 1_000_000;
    expect(shouldRefetchBulk(last + BULK_MIN_INTERVAL_MS, last)).toBe(true);
  });

  it("respeta un intervalo explícito", () => {
    expect(shouldRefetchBulk(5_000, 1_000, 10_000)).toBe(false);
    expect(shouldRefetchBulk(11_000, 1_000, 10_000)).toBe(true);
  });
});

describe("coalesce", () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  // La regresión que esto previene: el efecto de montaje y refreshList podian
  // arrancar dos recorridos del workspace a la vez, pidiendo las mismas
  // paginas de ~70 kB con el mismo cursor. El cooldown por si solo no basta:
  // ambos pasan el chequeo antes de que ninguno haya terminado.
  it("un segundo llamado concurrente se engancha al primero", async () => {
    const ref: InFlightRef<string[]> = { current: null };
    const d = deferred<string[]>();
    let starts = 0;
    const start = () => { starts += 1; return d.promise; };

    const a = coalesce(ref, start);
    const b = coalesce(ref, start);
    expect(starts).toBe(1);
    expect(a).toBe(b);

    d.resolve(["ot-1"]);
    await expect(a).resolves.toEqual(["ot-1"]);
    await expect(b).resolves.toEqual(["ot-1"]);
  });

  it("tras terminar, un llamado nuevo si arranca otro recorrido", async () => {
    const ref: InFlightRef<number> = { current: null };
    let starts = 0;
    const start = () => { starts += 1; return Promise.resolve(starts); };

    await coalesce(ref, start);
    await coalesce(ref, start);
    expect(starts).toBe(2);
    expect(ref.current).toBeNull();
  });

  it("un fallo libera el guard en vez de dejarlo trabado", async () => {
    const ref: InFlightRef<number> = { current: null };
    const d = deferred<number>();
    const first = coalesce(ref, () => d.promise);

    d.reject(new Error("network"));
    await expect(first).rejects.toThrow("network");
    // Sin esto, un unico fallo dejaria el snapshot muerto para toda la sesion.
    expect(ref.current).toBeNull();

    await expect(coalesce(ref, () => Promise.resolve(7))).resolves.toBe(7);
  });
});
