"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 200;
const CELL = 2;               // px per cell → canvas is 400×400
const CW = GRID * CELL;       // 400
const CH = GRID * CELL;       // 400
const MAX_HIST = 150;         // steps kept in history line-chart
const STEP_MS = 50;           // ms between simulation steps (~20 fps)

// Integer key helper: maps (x,y) → single integer for fast Map lookup
const K = (x: number, y: number) => x * GRID + y;

// ─── Types ───────────────────────────────────────────────────────────────────
type Scenario = "random" | "separate" | "overlapping";

interface Agent {
  x: number;
  y: number;
  wealth: number;
}

interface Config {
  numAgents: number;
  numSugar: number;
  visionRange: number;
  movingDistance: number;
  eatingDistance: number;
  scenario: Scenario;
}

interface Stats {
  step: number;
  sugarRemaining: number;
  avgWealth: number;
  gini: number;
  activeAgents: number;
  wealthBuckets: number[];
  maxBucket: number;
  sugarHistory: number[];
}

const DEFAULT_CONFIG: Config = {
  numAgents: 150,
  numSugar: 800,
  visionRange: 10,
  movingDistance: 2,
  eatingDistance: 2,
  scenario: "random",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeSugar(n: number, scenario: Scenario): Map<number, number> {
  const m = new Map<number, number>();
  const place = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(GRID - 1, Math.floor(x)));
    const cy = Math.max(0, Math.min(GRID - 1, Math.floor(y)));
    m.set(K(cx, cy), (m.get(K(cx, cy)) ?? 0) + Math.ceil(Math.random() * 3));
  };

  if (scenario === "random") {
    for (let i = 0; i < n; i++) place(Math.random() * GRID, Math.random() * GRID);
  } else if (scenario === "separate") {
    for (let i = 0; i < n; i++) {
      if (i < n / 2) place(Math.random() * GRID * 0.4, Math.random() * GRID * 0.4);
      else place(GRID * 0.6 + Math.random() * GRID * 0.4, GRID * 0.6 + Math.random() * GRID * 0.4);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const cx = i < n / 2 ? GRID * 0.35 : GRID * 0.65;
      const cy = i < n / 2 ? GRID * 0.35 : GRID * 0.65;
      const r = GRID * 0.25 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      place(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  }
  return m;
}

function makeAgents(n: number): Agent[] {
  return Array.from({ length: n }, () => ({
    x: Math.floor(Math.random() * GRID),
    y: Math.floor(Math.random() * GRID),
    wealth: 0,
  }));
}

function calcGini(sorted: number[]): number {
  const n = sorted.length;
  const s = sorted.reduce((a, b) => a + b, 0);
  if (s === 0 || n === 0) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * sorted[i];
  return Math.abs(num) / (n * s);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Simulation1Page() {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lineChartRef = useRef<HTMLCanvasElement>(null);

  // Simulation data in refs — never triggers re-renders
  const agentsRef = useRef<Agent[]>([]);
  const sugarRef = useRef<Map<number, number>>(new Map());
  const stepRef = useRef(0);
  const histRef = useRef<number[]>([]);
  const initialSugarRef = useRef(0);

  // Animation control refs
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTickRef = useRef(0);
  const configRef = useRef<Config>(DEFAULT_CONFIG);

  // React state (for UI only)
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<Stats>({
    step: 0,
    sugarRemaining: 0,
    avgWealth: 0,
    gini: 0,
    activeAgents: 0,
    wealthBuckets: new Array(10).fill(0),
    maxBucket: 1,
    sugarHistory: [],
  });

  // Keep configRef in sync with React state
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ── Render canvas ─────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, CW, CH);

    // Draw sugar (amber)
    ctx.fillStyle = "#f59e0b";
    for (const k of sugarRef.current.keys()) {
      const sx = Math.floor(k / GRID);
      const sy = k % GRID;
      ctx.fillRect(sx * CELL, sy * CELL, CELL, CELL);
    }

    // Draw agents (blue)
    ctx.fillStyle = "#3b82f6";
    for (const a of agentsRef.current) {
      ctx.fillRect(a.x * CELL, a.y * CELL, CELL, CELL);
    }
  }, []);

  // ── Render line chart ─────────────────────────────────────────────────────
  const renderLineChart = useCallback(() => {
    const c = lineChartRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = c;

    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(0, 0, w, h);

    const hist = histRef.current;
    if (hist.length < 2) return;

    const maxVal = Math.max(initialSugarRef.current, 1);

    // Fill area
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h - (v / maxVal) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = "#f59e0b22";
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h - (v / maxVal) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mid grid line
    ctx.strokeStyle = "#1a1a3e";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, []);

  // ── Update React stats ────────────────────────────────────────────────────
  const updateStats = useCallback(() => {
    const agents = agentsRef.current;
    const sugar = sugarRef.current;
    const hist = histRef.current;

    hist.push(sugar.size);
    if (hist.length > MAX_HIST) hist.shift();

    const wealths = agents.map((a) => a.wealth).sort((a, b) => a - b);
    const sum = wealths.reduce((a, b) => a + b, 0);
    const avg = agents.length ? sum / agents.length : 0;
    const g = calcGini(wealths);
    const maxW = wealths[wealths.length - 1] ?? 0;

    const buckets = new Array(10).fill(0);
    if (maxW > 0) {
      for (const w of wealths) {
        buckets[Math.min(9, Math.floor((w / (maxW + 0.001)) * 10))]++;
      }
    }

    setStats({
      step: stepRef.current,
      sugarRemaining: sugar.size,
      avgWealth: avg,
      gini: g,
      activeAgents: agents.length,
      wealthBuckets: buckets,
      maxBucket: Math.max(1, ...buckets),
      sugarHistory: [...hist],
    });
  }, []);

  // ── Simulation tick ───────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const agents = agentsRef.current;
    const sugar = sugarRef.current;
    const cfg = configRef.current;

    // Move agents
    for (const a of agents) {
      let bx = -1, by = -1, bd = Infinity;

      for (let dx = -cfg.visionRange; dx <= cfg.visionRange; dx++) {
        for (let dy = -cfg.visionRange; dy <= cfg.visionRange; dy++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > cfg.visionRange) continue;
          const nx = (a.x + dx + GRID) % GRID;
          const ny = (a.y + dy + GRID) % GRID;
          if (sugar.has(K(nx, ny)) && d < bd) {
            bd = d;
            bx = nx;
            by = ny;
          }
        }
      }

      if (bx >= 0) {
        const ddx = bx - a.x;
        const ddy = by - a.y;
        const adx = Math.abs(ddx);
        const ady = Math.abs(ddy);
        if (adx + ady <= cfg.movingDistance) {
          a.x = bx;
          a.y = by;
        } else if (adx >= ady) {
          a.x = (a.x + Math.sign(ddx) * Math.min(cfg.movingDistance, adx) + GRID) % GRID;
        } else {
          a.y = (a.y + Math.sign(ddy) * Math.min(cfg.movingDistance, ady) + GRID) % GRID;
        }
      } else {
        const dir = Math.floor(Math.random() * 4);
        const mv = Math.ceil(Math.random() * cfg.movingDistance);
        if (dir === 0) a.x = (a.x + mv) % GRID;
        else if (dir === 1) a.x = (a.x - mv + GRID) % GRID;
        else if (dir === 2) a.y = (a.y + mv) % GRID;
        else a.y = (a.y - mv + GRID) % GRID;
      }
    }

    // Consume sugar — each sugar cell eaten by at most one agent
    const eaten = new Set<number>();
    for (const a of agents) {
      for (let dx = -cfg.eatingDistance; dx <= cfg.eatingDistance; dx++) {
        for (let dy = -cfg.eatingDistance; dy <= cfg.eatingDistance; dy++) {
          if (Math.abs(dx) + Math.abs(dy) > cfg.eatingDistance) continue;
          const nx = (a.x + dx + GRID) % GRID;
          const ny = (a.y + dy + GRID) % GRID;
          const k = K(nx, ny);
          if (sugar.has(k) && !eaten.has(k)) {
            a.wealth += sugar.get(k)!;
            eaten.add(k);
          }
        }
      }
    }
    for (const k of eaten) sugar.delete(k);

    stepRef.current++;
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const loop = useCallback(
    (ts: number) => {
      if (!runningRef.current) return;
      if (ts - lastTickRef.current >= STEP_MS) {
        tick();
        updateStats();       // push to histRef synchronously, then setStats (batched)
        renderCanvas();
        renderLineChart();   // reads histRef — now updated
        lastTickRef.current = ts;
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [tick, updateStats, renderCanvas, renderLineChart]
  );

  // ── Init ──────────────────────────────────────────────────────────────────
  const init = useCallback(
    (cfg: Config) => {
      agentsRef.current = makeAgents(cfg.numAgents);
      sugarRef.current = makeSugar(cfg.numSugar, cfg.scenario);
      stepRef.current = 0;
      histRef.current = [];
      initialSugarRef.current = sugarRef.current.size;

      setStats({
        step: 0,
        sugarRemaining: sugarRef.current.size,
        avgWealth: 0,
        gini: 0,
        activeAgents: cfg.numAgents,
        wealthBuckets: new Array(10).fill(0),
        maxBucket: 1,
        sugarHistory: [sugarRef.current.size],
      });

      setTimeout(() => {
        renderCanvas();
        renderLineChart();
      }, 0);
    },
    [renderCanvas, renderLineChart]
  );

  // On mount
  useEffect(() => {
    init(configRef.current);
  }, [init]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const start = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  };

  const pause = () => {
    runningRef.current = false;
    setIsRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const reset = () => {
    pause();
    init(configRef.current);
  };

  const restart = () => {
    pause();
    init({ ...configRef.current });
  };

  const setParam = (key: keyof Config, val: number | string) => {
    const next = { ...configRef.current, [key]: val };
    configRef.current = next;
    setConfig(next);
  };

  const giniColor =
    stats.gini > 0.6
      ? "text-red-400"
      : stats.gini > 0.3
      ? "text-yellow-400"
      : "text-emerald-400";

  const giniLabel =
    stats.gini < 0.3 ? "Low" : stats.gini < 0.6 ? "Medium" : "High";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#050510] text-white">
      {/* ── Header ── */}
      <header className="border-b border-[#1a1a3e] px-6 py-4">
        <div className="max-w-[1400px] mx-auto">
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Link href="/projectx" className="hover:text-white transition-colors">
              Project X
            </Link>
            <span>/</span>
            <span className="text-[#60a5fa]">Simulation 1</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight">
            Sugarscape Agent-Based Simulation
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl leading-relaxed">
            A decentralized agent-based model where individuals compete for spatial
            resources, generating emergent wealth distributions and social structures.
          </p>
          <a
            href="https://arxiv.org/abs/1408.3441"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#60a5fa] hover:underline mt-0.5 inline-block"
          >
            arxiv.org/abs/1408.3441 ↗
          </a>
        </div>
      </header>

      {/* ── Dashboard ── */}
      <div className="max-w-[1400px] mx-auto p-4 flex flex-col gap-4">
        {/* Top row: canvas + metrics */}
        <div className="flex gap-4 items-start">
          {/* Canvas */}
          <div className="flex-shrink-0 flex flex-col gap-2">
            <div
              className="relative border border-[#1a1a3e] rounded-lg overflow-hidden"
              style={{ width: CW, height: CH }}
            >
              <canvas
                ref={canvasRef}
                width={CW}
                height={CH}
                style={{ display: "block" }}
              />
              {/* Status badge */}
              <div className="absolute top-2 left-2">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isRunning
                      ? "bg-emerald-950 border-emerald-700 text-emerald-400"
                      : "bg-[#1a1a3e] border-[#3a3a7e] text-gray-400"
                  }`}
                >
                  {isRunning ? "● RUNNING" : "■ PAUSED"}
                </span>
              </div>
              {/* Legend */}
              <div className="absolute bottom-2 right-2 flex items-center gap-3 bg-[#050510cc] rounded px-2 py-1">
                <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span className="w-2 h-2 bg-[#3b82f6] inline-block rounded-sm" />
                  Agent
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <span className="w-2 h-2 bg-[#f59e0b] inline-block rounded-sm" />
                  Sugar
                </span>
              </div>
            </div>
          </div>

          {/* Metrics panel */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* 6 stat cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: "Simulation Step",
                  val: stats.step.toLocaleString(),
                  color: "text-white",
                },
                {
                  label: "Active Agents",
                  val: stats.activeAgents.toLocaleString(),
                  color: "text-[#60a5fa]",
                },
                {
                  label: "Sugar Remaining",
                  val: stats.sugarRemaining.toLocaleString(),
                  color: "text-[#f59e0b]",
                },
                {
                  label: "Avg Wealth",
                  val: stats.avgWealth.toFixed(2),
                  color: "text-emerald-400",
                },
                {
                  label: "Gini Coefficient",
                  val: stats.gini.toFixed(3),
                  color: giniColor,
                },
                {
                  label: "Inequality",
                  val: giniLabel,
                  color: giniColor,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-[#0a0a1a] border border-[#1a1a3e] rounded-lg p-3"
                >
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    {s.label}
                  </div>
                  <div className={`text-lg font-mono font-semibold ${s.color}`}>
                    {s.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Sugar remaining — line chart */}
            <div className="bg-[#0a0a1a] border border-[#1a1a3e] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                Sugar Remaining — Over Time
              </div>
              <canvas
                ref={lineChartRef}
                width={520}
                height={72}
                className="w-full rounded"
                style={{ height: 72 }}
              />
            </div>

            {/* Wealth distribution histogram */}
            <div className="bg-[#0a0a1a] border border-[#1a1a3e] rounded-lg p-3 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
                Wealth Distribution
              </div>
              <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                {stats.wealthBuckets.map((count, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t transition-all duration-200"
                    style={{
                      height: `${Math.max(1, (count / stats.maxBucket) * 100)}%`,
                      background: `hsl(${210 + i * 12}, 65%, ${30 + i * 3}%)`,
                    }}
                    title={`Bucket ${i + 1}: ${count} agents`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[9px] text-gray-600">
                <span>Low wealth</span>
                <span>High wealth</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls panel */}
        <div className="bg-[#0a0a1a] border border-[#1a1a3e] rounded-lg p-5">
          <div className="flex gap-6">
            {/* Sliders */}
            <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-4">
              {(
                [
                  { key: "numAgents", label: "Number of Agents", min: 10, max: 500, step: 10 },
                  { key: "numSugar", label: "Sugar Resources", min: 100, max: 2000, step: 50 },
                  { key: "visionRange", label: "Vision Range", min: 1, max: 30, step: 1 },
                  { key: "movingDistance", label: "Move Distance", min: 1, max: 10, step: 1 },
                  { key: "eatingDistance", label: "Eat Distance", min: 0, max: 8, step: 1 },
                ] as {
                  key: keyof Config;
                  label: string;
                  min: number;
                  max: number;
                  step: number;
                }[]
              ).map((sl) => (
                <div key={sl.key}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-400">{sl.label}</label>
                    <span className="text-xs font-mono text-white bg-[#1a1a3e] px-1.5 py-0.5 rounded">
                      {config[sl.key as keyof Config]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    step={sl.step}
                    value={config[sl.key as keyof Config] as number}
                    onChange={(e) => setParam(sl.key, +e.target.value)}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: "#3b82f6" }}
                  />
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px bg-[#1a1a3e] self-stretch" />

            {/* Scenario selector */}
            <div className="w-52 flex-shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
                Scenario
              </div>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["random", "Random Distribution"],
                    ["separate", "Separate Areas"],
                    ["overlapping", "Overlapping Areas"],
                  ] as [Scenario, string][]
                ).map(([s, label]) => (
                  <button
                    key={s}
                    onClick={() => setParam("scenario", s)}
                    className={`px-3 py-2 rounded text-xs text-left font-medium transition-colors ${
                      config.scenario === s
                        ? "bg-[#1d4ed8] text-white"
                        : "bg-[#1a1a3e] text-gray-400 hover:text-white hover:bg-[#252560]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-[#1a1a3e] self-stretch" />

            {/* Action buttons */}
            <div className="flex flex-col gap-2 w-36 flex-shrink-0 justify-center">
              <button
                onClick={start}
                disabled={isRunning}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
              >
                <span>▶</span> Start
              </button>
              <button
                onClick={pause}
                disabled={!isRunning}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
              >
                <span>⏸</span> Pause
              </button>
              <button
                onClick={reset}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-[#1a1a3e] hover:bg-[#252560] text-gray-300 hover:text-white border border-[#3a3a7e] flex items-center justify-center gap-2"
              >
                <span>↺</span> Reset
              </button>
              <button
                onClick={restart}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-[#1e40af] hover:bg-[#1d4ed8] text-white flex items-center justify-center gap-2"
              >
                <span>⟳</span> Restart
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
