export type Estado = "AGUARDANDO" | "BOMBEANDO" | "DESCANSO";

export type Leitura = {
  estado: Estado;
  coleta: number | null; // cm, null = erro de sensor
  caixa: number | null;
  t: number;
};

export type Evento =
  | { tipo: "leitura"; leitura: Leitura }
  | { tipo: "ligou" }
  | { tipo: "desligou"; motivo: string }
  | { tipo: "texto"; texto: string };

const RE_LEITURA =
  /Estado:\s*(AGUARDANDO|BOMBEANDO|DESCANSO)\s*\|\s*Coleta:\s*(ERRO SENSOR|[\d.]+\s*cm)\s*\|\s*Caixa:\s*(ERRO SENSOR|[\d.]+\s*cm)/;

function cm(v: string): number | null {
  if (v.startsWith("ERRO")) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function parseLinha(linha: string, t = Date.now()): Evento {
  const l = linha.trim();
  const m = l.match(RE_LEITURA);
  if (m) {
    return {
      tipo: "leitura",
      leitura: { estado: m[1] as Estado, coleta: cm(m[2]), caixa: cm(m[3]), t },
    };
  }
  if (l.includes(">>> BOMBA LIGADA")) return { tipo: "ligou" };
  const d = l.match(/>>> BOMBA DESLIGADA - motivo:\s*(.*)/);
  if (d) return { tipo: "desligou", motivo: d[1].trim() };
  return { tipo: "texto", texto: l };
}

/** Converte distância (cm) em % de nível: distância menor = mais água. */
export function nivelPercent(dist: number | null, cheio: number, vazio: number): number | null {
  if (dist == null) return null;
  const p = ((vazio - dist) / (vazio - cheio)) * 100;
  return Math.max(0, Math.min(100, p));
}
