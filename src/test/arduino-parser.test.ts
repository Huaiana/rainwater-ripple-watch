import { describe, it, expect } from "vitest";
import { parseLinha, nivelPercent } from "@/lib/arduino-parser";

describe("parseLinha", () => {
  it("lê linha de estado do Arduino", () => {
    const e = parseLinha("Estado: BOMBEANDO | Coleta: 9.4 cm | Caixa: 7.1 cm", 1);
    expect(e).toEqual({ tipo: "leitura", leitura: { estado: "BOMBEANDO", coleta: 9.4, caixa: 7.1, t: 1 } });
  });
  it("trata erro de sensor", () => {
    const e = parseLinha("Estado: AGUARDANDO | Coleta: ERRO SENSOR | Caixa: 5.0 cm", 1);
    expect(e.tipo === "leitura" && e.leitura.coleta).toBeNull();
  });
  it("detecta desligamento com motivo", () => {
    expect(parseLinha(">>> BOMBA DESLIGADA - motivo: caixa cheia")).toEqual({ tipo: "desligou", motivo: "caixa cheia" });
  });
  it("menor distância = mais água", () => {
    expect(nivelPercent(5, 5, 25)).toBe(100);
    expect(nivelPercent(25, 5, 25)).toBe(0);
  });
});

import { volumeMl } from "@/lib/arduino-parser";
describe("volumeMl", () => {
  it("reservatório de 200 ml", () => {
    expect(volumeMl(75)).toBe(150);
    expect(volumeMl(100)).toBe(200);
    expect(volumeMl(null)).toBeNull();
  });
});
