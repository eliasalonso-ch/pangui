import { describe, expect, it } from "vitest";
import { firmarState, verificarState } from "@/lib/google-state";

const T = 1_800_000_000_000;

describe("state del OAuth de Google", () => {
  it("vuelve con el mismo workspace y usuario", () => {
    const s = firmarState("ws-1", "u-1", "secreto", T);
    expect(verificarState(s, "secreto", T + 1000)).toMatchObject({ ws: "ws-1", uid: "u-1" });
  });
  it("rechaza otra firma, uno alterado y uno vencido", () => {
    const s = firmarState("ws-1", "u-1", "secreto", T);
    expect(verificarState(s, "otro", T)).toBeNull();
    const [, sig] = s.split(".");
    const falso = Buffer.from(JSON.stringify({ ws: "ws-2", uid: "u-1", exp: T + 600_000 })).toString("base64url");
    expect(verificarState(`${falso}.${sig}`, "secreto", T)).toBeNull();
    expect(verificarState(s, "secreto", T + 11 * 60_000)).toBeNull();
    expect(verificarState("basura", "secreto", T)).toBeNull();
  });
});
