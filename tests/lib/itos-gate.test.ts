import { describe, it, expect } from "vitest";
import { tieneItos, ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";

describe("tieneItos", () => {
  it("habilita ITOs solo en el espacio de Electrilam", () => {
    expect(tieneItos(ELECTRILAM_WORKSPACE_ID)).toBe(true);
  });

  it("no los habilita en otros espacios de trabajo", () => {
    expect(tieneItos("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("no los habilita mientras el workspace aún no carga", () => {
    expect(tieneItos(null)).toBe(false);
    expect(tieneItos(undefined)).toBe(false);
  });

  it("mantiene el mismo id que fija la app móvil", () => {
    // Si este id cambia, hay que cambiarlo también en
    // pangui-native-stable/constants/index.ts o las apps se desincronizan.
    expect(ELECTRILAM_WORKSPACE_ID).toBe("f1b64714-6de2-4d49-b6e4-5959553e94d7");
  });
});
