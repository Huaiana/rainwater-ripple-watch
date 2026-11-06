import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { parseLinha, nivelPercent, volumeMl, CAPACIDADE_ML, type Leitura } from "@/lib/arduino-parser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Monitor Água da Chuva — Arduino via USB" },
      { name: "description", content: "Acompanhe em tempo real os reservatórios e a bomba do Arduino Uno pelo navegador (Web Serial)." },
      { property: "og:title", content: "Monitor Água da Chuva — Arduino via USB" },
      { property: "og:description", content: "Leituras ao vivo dos sensores HC-SR04 e da bomba pelo cabo USB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

// Limites do código Arduino (cm)
const T1L = { ligar: 8, desligar: 15 };
const T2L = { cheio: 5, libera: 8 };
type Calib = { t1Cheio: number; t1Vazio: number; t2Cheio: number; t2Vazio: number };
const CALIB_PADRAO: Calib = { t1Cheio: 8, t1Vazio: 15, t2Cheio: 5, t2Vazio: 8 };
const CALIB_KEY = "calibracao-tanques";

type SerialPortLike = {
  open: (o: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};

function Index() {
  const [suportado, setSuportado] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [atual, setAtual] = useState<Leitura | null>(null);
  const [hist, setHist] = useState<Leitura[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [ciclos, setCiclos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  const [calib, setCalib] = useState<Calib>(CALIB_PADRAO);
  useEffect(() => {
    setSuportado("serial" in navigator);
    try {
      const c = localStorage.getItem(CALIB_KEY);
      if (c) setCalib({ ...CALIB_PADRAO, ...JSON.parse(c) });
    } catch { /* ignore */ }
  }, []);
  const salvarCalib = (c: Calib) => {
    setCalib(c);
    localStorage.setItem(CALIB_KEY, JSON.stringify(c));
  };
  const T1 = { cheio: calib.t1Cheio, vazio: calib.t1Vazio };
  const T2 = { cheio: calib.t2Cheio, vazio: calib.t2Vazio };

  const addLog = (s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 200));

  async function conectar() {
    setErro(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port: SerialPortLike = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setConectado(true);
      addLog("Conectado (9600 baud)");
      const decoder = new TextDecoderStream();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      port.readable!.pipeTo(decoder.writable as any).catch(() => {});
      const reader = decoder.readable.getReader();
      readerRef.current = reader;
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const linhas = buf.split(/\r?\n/);
        buf = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = parseLinha(linha);
          if (ev.tipo === "leitura") {
            setAtual(ev.leitura);
            setHist((h) => [...h, ev.leitura].slice(-120));
          } else if (ev.tipo === "ligou") {
            setCiclos((c) => c + 1);
            addLog("💧 Bomba LIGADA");
          } else if (ev.tipo === "desligou") {
            addLog(`⏹ Bomba DESLIGADA — ${ev.motivo}`);
          } else addLog(ev.texto);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/No port selected/i.test(msg)) setErro(msg);
    } finally {
      await desconectar(true);
    }
  }

  async function desconectar(silencioso = false) {
    try { await readerRef.current?.cancel(); } catch { /* ignore */ }
    try { await portRef.current?.close(); } catch { /* ignore */ }
    readerRef.current = null;
    if (portRef.current && !silencioso) addLog("Desconectado");
    portRef.current = null;
    setConectado(false);
  }

  const p1 = nivelPercent(atual?.coleta ?? null, T1.cheio, T1.vazio);
  const p2 = nivelPercent(atual?.caixa ?? null, T2.cheio, T2.vazio);
  const bombeando = atual?.estado === "BOMBEANDO";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Arduino Uno · HC-SR04 ×2 · Relé</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Aproveitamento de água da chuva</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 font-mono text-sm ${conectado ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${conectado ? "animate-pulse bg-primary" : "bg-muted-foreground/40"}`} />
              {conectado ? "USB conectado" : "Desconectado"}
            </span>
            {conectado ? (
              <button onClick={() => desconectar()} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent">
                Desconectar
              </button>
            ) : (
              <button onClick={conectar} disabled={!suportado} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Conectar Arduino (USB)
              </button>
            )}
          </div>
        </header>

        {!suportado && (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Este navegador não suporta Web Serial. Use Google Chrome ou Microsoft Edge no computador.
          </div>
        )}
        {erro && (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Erro: {erro}. Feche o Monitor Serial da IDE do Arduino se estiver aberto.
          </div>
        )}

        <section className="mt-8 grid gap-6 md:grid-cols-[1fr_auto_1fr]">
          <Tanque nome="Reservatório de coleta" sub="Tanque 1 · chuva" dist={atual?.coleta} pct={p1}
            marcas={[{ label: `liga ${T1L.ligar}cm`, pct: nivelPercent(T1L.ligar, T1.cheio, T1.vazio)! }, { label: `para ${T1L.desligar}cm`, pct: nivelPercent(T1L.desligar, T1.cheio, T1.vazio)! }]} />
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6">
            <div className={`flex h-24 w-24 items-center justify-center rounded-full border-4 ${bombeando ? "border-primary" : "border-border"}`}>
              <svg viewBox="0 0 24 24" className={`h-12 w-12 ${bombeando ? "animate-spin text-primary" : "text-muted-foreground"}`} style={{ animationDuration: "1.2s" }} fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
              </svg>
            </div>
            <p className="font-mono text-xs uppercase text-muted-foreground">Bomba</p>
            <p className="text-xl font-bold">{atual?.estado ?? "—"}</p>
            <p className="font-mono text-xs text-muted-foreground">{ciclos} ciclo(s) nesta sessão</p>
          </div>
          <Tanque nome="Caixa-d'água" sub="Tanque 2" dist={atual?.caixa} pct={p2}
            marcas={[{ label: `cheia ${T2L.cheio}cm`, pct: nivelPercent(T2L.cheio, T2.cheio, T2.vazio)! }, { label: `libera ${T2L.libera}cm`, pct: nivelPercent(T2L.libera, T2.cheio, T2.vazio)! }]} />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">Distâncias (últimas {hist.length} leituras)</h2>
            <p className="text-xs text-muted-foreground">Menor distância = mais água</p>
            <Grafico hist={hist} />
            <div className="mt-2 flex gap-4 font-mono text-xs">
              <span className="text-chart-1">■ Coleta</span><span className="text-chart-2">■ Caixa</span>
            </div>
          </div>
          <Calibracao calib={calib} onChange={salvarCalib} />
          <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
            <h2 className="font-semibold">Eventos</h2>
            <div className="mt-3 h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">
              {log.length === 0 ? <p className="text-muted-foreground">Conecte o Arduino para ver as mensagens…</p> : log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Tanque({ nome, sub, dist, pct, marcas }: { nome: string; sub: string; dist: number | null | undefined; pct: number | null; marcas: { label: string; pct: number }[] }) {
  const erro = dist === null;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <div><h2 className="font-semibold">{nome}</h2><p className="text-xs text-muted-foreground">{sub}</p></div>
        <p className="font-mono text-sm text-muted-foreground">{erro ? "ERRO" : dist == null ? "—" : `${dist.toFixed(1)} cm`}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold">
        {volumeMl(erro ? null : pct) ?? "—"} ml <span className="text-base text-muted-foreground">/ {CAPACIDADE_ML} ml</span>
      </p>
      <div className="relative mt-4 h-56 overflow-hidden rounded-md border-2 border-border bg-muted">
        <div className="absolute inset-x-0 bottom-0 bg-primary/70 transition-all duration-500" style={{ height: `${pct ?? 0}%` }} />
        {marcas.map((m) => (
          <div key={m.label} className="absolute inset-x-0 border-t border-dashed border-foreground/40" style={{ bottom: `${m.pct}%` }}>
            <span className="absolute right-1 -top-4 font-mono text-[10px] text-foreground/70">{m.label}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-center justify-center font-mono text-3xl font-bold text-foreground">
          {erro ? <span className="text-destructive text-base">ERRO SENSOR</span> : pct == null ? "" : `${Math.round(pct)}%`}
        </div>
      </div>
    </div>
  );
}

function Grafico({ hist }: { hist: Leitura[] }) {
  const W = 500, H = 180, max = 40;
  const linha = (k: "coleta" | "caixa") =>
    hist.map((h, i) => (h[k] == null ? null : `${(i / Math.max(1, hist.length - 1)) * W},${(Math.min(h[k]!, max) / max) * H}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-48 w-full rounded bg-muted">
      {[10, 20, 30].map((v) => (
        <g key={v}><line x1="0" x2={W} y1={(v / max) * H} y2={(v / max) * H} className="stroke-border" /><text x="4" y={(v / max) * H - 2} className="fill-muted-foreground" fontSize="10">{v}cm</text></g>
      ))}
      <polyline points={linha("coleta")} fill="none" className="stroke-chart-1" strokeWidth="2" />
      <polyline points={linha("caixa")} fill="none" className="stroke-chart-2" strokeWidth="2" />
    </svg>
  );
}

function Calibracao({ calib, onChange }: { calib: Calib; onChange: (c: Calib) => void }) {
  const campo = (k: keyof Calib, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="number" step="0.5" min="0" value={calib[k]}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange({ ...calib, [k]: v }); }}
        className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground" />
    </label>
  );
  const invalido = calib.t1Vazio <= calib.t1Cheio || calib.t2Vazio <= calib.t2Cheio;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Calibração</h2>
        <button onClick={() => onChange(CALIB_PADRAO)} className="text-xs font-semibold text-primary hover:underline">Restaurar padrão</button>
      </div>
      <p className="text-xs text-muted-foreground">Distância do sensor até a água (cm), medida na bancada. Capacidade: {CAPACIDADE_ML} ml cada.</p>
      <p className="mt-4 text-sm font-semibold">Reservatório de coleta</p>
      <div className="mt-2 grid grid-cols-2 gap-3">{campo("t1Cheio", "Cheio (cm)")}{campo("t1Vazio", "Vazio (cm)")}</div>
      <p className="mt-4 text-sm font-semibold">Caixa-d'água</p>
      <div className="mt-2 grid grid-cols-2 gap-3">{campo("t2Cheio", "Cheio (cm)")}{campo("t2Vazio", "Vazio (cm)")}</div>
      {invalido && <p className="mt-3 text-xs text-destructive">A distância "vazio" deve ser maior que "cheio".</p>}
      <p className="mt-3 text-xs text-muted-foreground">Ajustes ficam salvos neste navegador.</p>
    </div>
  );
}
