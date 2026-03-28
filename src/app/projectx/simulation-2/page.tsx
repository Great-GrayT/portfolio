"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────
// CellType: <0 = barrier, 0 = empty, 1..numGroups = group index
type UpdateMethod = "synchronous" | "asynchronous";
type MovementRule = "nearest-empty" | "random-empty" | "best-satisfaction";

interface Config {
  gridSize: number;
  numGroups: number;
  groupRatios: number[];  // length = numGroups, sum <= 100; vacancy = 100 - sum
  tolerance: number;
  radius: number;
  updateMethod: UpdateMethod;
  movementRule: MovementRule;
  speed: number;
  maxSteps: number;
  seed: number;
}

interface Metrics {
  step: number;
  satisfiedPct: number;
  unhappyCount: number;
  movementsPerStep: number;
  avgSameNeighborRatio: number;
  segregationIndex: number;
  convergence: "stable" | "not stable" | "max steps reached";
  stopCondition: string | null;
  groupCounts: number[];
  countEmpty: number;
  clusteringIntensity: number;
  satisfiedHistory: number[];
  segregationHistory: number[];
  initialSatisfiedPct: number;
  initialSegIndex: number;
  deltaSatisfied: number;
  deltaSegIndex: number;
  stableSteps: number;
  agentsZeroNeighbors: number;
  avgMoveDistance: number;
  totalMovements: number;
  tippingDetected: boolean;
}

// ─── Color Palette (6 groups max) ────────────────────────────────────────────
const GROUP_COLORS_SATISFIED = [
  "#2563eb", // Group 1 — blue
  "#ea580c", // Group 2 — orange
  "#16a34a", // Group 3 — green
  "#9333ea", // Group 4 — purple
  "#fbff00", // Group 5 — yellow
  "#0891b2", // Group 6 — cyan
];
const GROUP_COLORS_UNHAPPY = [
  "#93c5fd", // Group 1 — light blue
  "#fdba74", // Group 2 — light orange
  "#86efac", // Group 3 — light green
  "#d8b4fe", // Group 4 — light purple
  "#fffd8d8e", // Group 5 — light yellow
  "#a5f3fc", // Group 6 — light cyan
];
const GROUP_LABELS = ["Group 1", "Group 2", "Group 3", "Group 4", "Group 5", "Group 6"];

const DEFAULT_CONFIG: Config = {
  gridSize: 60,
  numGroups: 2,
  groupRatios: [45, 45],
  tolerance: 0.33,
  radius: 1,
  updateMethod: "asynchronous",
  movementRule: "nearest-empty",
  speed: 80,
  maxSteps: 2000,
  seed: 42,
};

const PRESETS = [
  { label: "Mixed  (f = 0.25)",     tolerance: 0.25, numGroups: 2, groupRatios: [45, 45], seed: 42 },
  { label: "Tipping (f = 0.26)",    tolerance: 0.26, numGroups: 2, groupRatios: [45, 45], seed: 42 },
  { label: "Segregated (f = 0.70)", tolerance: 0.70, numGroups: 2, groupRatios: [45, 45], seed: 42 },
] as const;

const MAX_HIST = 200;
const CANVAS_SIZE = 540;

// ─── Barrier constants ───────────────────────────────────────────────────────
const RIVER    = -1;
const MOUNTAIN = -2;
const BUILDING = -3;

// ─── Pre-parsed RGB values (avoid hex parsing in render loop) ────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const EMPTY_RGB:    [number, number, number] = [16, 16, 16];
const RIVER_RGB:    [number, number, number] = [10, 30, 46];
const MOUNTAIN_RGB: [number, number, number] = [15, 26, 20];
const BUILDING_RGB: [number, number, number] = [28, 22, 20];

const PALETTE_SATISFIED_RGB: [number, number, number][] = GROUP_COLORS_SATISFIED.map(hexToRgb);
const PALETTE_UNHAPPY_RGB:   [number, number, number][] = GROUP_COLORS_UNHAPPY.map(hexToRgb);

const LERP_FACTOR = 0.18;

// ─── Seeded RNG ──────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

// ─── Neighbor cache ──────────────────────────────────────────────────────────
function buildNeighborCache(N: number, radius: number): number[][] {
  const cache: number[][] = new Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const nbrs: number[] = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N)
            nbrs.push(nr * N + nc);
        }
      }
      cache[idx] = nbrs;
    }
  }
  return cache;
}

// ─── City barrier generation ─────────────────────────────────────────────────
function generateCityBarriers(cells: number[], N: number, rng: () => number): void {
  // River: meander from one edge to the opposite
  const horizontal = rng() < 0.5;
  let pos = Math.floor(rng() * N);
  let momentum = 0;

  if (horizontal) {
    // meander row-by-row (left→right), pos = column
    for (let col = 0; col < N; col++) {
      const drift = (rng() - 0.5) * 2 + momentum * 0.3;
      momentum = momentum * 0.6 + drift * 0.4;
      pos = Math.max(2, Math.min(N - 3, Math.round(pos + momentum)));
      for (let d = -1; d <= 1; d++) {
        const r = pos + d;
        if (r >= 0 && r < N) cells[r * N + col] = RIVER;
      }
    }
  } else {
    // meander col-by-col (top→bottom), pos = row
    for (let row = 0; row < N; row++) {
      const drift = (rng() - 0.5) * 2 + momentum * 0.3;
      momentum = momentum * 0.6 + drift * 0.4;
      pos = Math.max(2, Math.min(N - 3, Math.round(pos + momentum)));
      for (let d = -1; d <= 1; d++) {
        const c = pos + d;
        if (c >= 0 && c < N) cells[row * N + c] = RIVER;
      }
    }
  }

  // Mountains/parks: 1–2 elliptical blobs
  const numMountains = 1 + Math.floor(rng() * 2);
  for (let m = 0; m < numMountains; m++) {
    const rx = 4 + Math.floor(rng() * 4); // 4–7
    const ry = 3 + Math.floor(rng() * 4); // 3–6
    const cx = rx + Math.floor(rng() * (N - 2 * rx));
    const cy = ry + Math.floor(rng() * (N - 2 * ry));
    for (let dr = -ry; dr <= ry; dr++) {
      for (let dc = -rx; dc <= rx; dc++) {
        const rr = cy + dr;
        const cc = cx + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        if ((dc / rx) ** 2 + (dr / ry) ** 2 <= 1) {
          const idx = rr * N + cc;
          if (cells[idx] === 0) cells[idx] = MOUNTAIN;
        }
      }
    }
  }

  // Buildings: 5–9 rectangles
  const numBuildings = 5 + Math.floor(rng() * 5);
  for (let b = 0; b < numBuildings; b++) {
    const w = 2 + Math.floor(rng() * 5); // 2–6
    const h = 2 + Math.floor(rng() * 4); // 2–5
    const bx = Math.floor(rng() * (N - w));
    const by = Math.floor(rng() * (N - h));
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        const idx = (by + dr) * N + (bx + dc);
        if (cells[idx] === 0) cells[idx] = BUILDING;
      }
    }
  }
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────
function buildGrid(cfg: Config, rng: () => number): number[] {
  const N = cfg.gridSize;
  const total = N * N;
  const cells: number[] = new Array(total).fill(0);

  // Place barriers first
  generateCityBarriers(cells, N, rng);

  // Collect non-barrier indices
  const available: number[] = [];
  for (let i = 0; i < total; i++) {
    if (cells[i] === 0) available.push(i);
  }

  // Fisher-Yates shuffle of available
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  // Place groups relative to available cells
  let cursor = 0;
  for (let g = 0; g < cfg.numGroups; g++) {
    const count = Math.round((cfg.groupRatios[g] / 100) * available.length);
    for (let k = 0; k < count && cursor < available.length; k++, cursor++) {
      cells[available[cursor]] = g + 1;
    }
  }

  return cells;
}

function sameRatioCached(idx: number, cells: number[], nbrs: number[]): number {
  const t = cells[idx];
  if (t <= 0) return 0;
  let occupied = 0, same = 0;
  for (const n of nbrs) {
    if (cells[n] > 0) { occupied++; if (cells[n] === t) same++; }
  }
  return occupied === 0 ? 1 : same / occupied;
}

function isSatisfiedCached(idx: number, cells: number[], nbrs: number[], tol: number): boolean {
  if (cells[idx] <= 0) return true; // barriers and empties are trivially satisfied
  return sameRatioCached(idx, cells, nbrs) >= tol;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Simulation2Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellsRef = useRef<number[]>([]);
  const neighborCacheRef = useRef<number[][]>([]);
  const unhappySetRef = useRef<Set<number>>(new Set());
  const rngRef = useRef<(() => number)>(() => 0);
  const stepRef = useRef(0);
  const movementsRef = useRef(0);
  const prevMovementsRef = useRef(0);
  const stableCountRef = useRef(0);
  const totalMoveDistRef = useRef(0);
  const totalMovesCountRef = useRef(0);
  const initialSnapshotRef = useRef({ satisfiedPct: 0, segregationIndex: 0 });
  const satisfiedHistRef = useRef<number[]>([]);
  const segregHistRef = useRef<number[]>([]);
  const unhappyHistRef = useRef<number[]>([]);
  const movementsHistRef = useRef<number[]>([]);
  const avgRatioHistRef = useRef<number[]>([]);
  const clusteringHistRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTickRef = useRef(0);
  const configRef = useRef<Config>(DEFAULT_CONFIG);

  const chart1Ref = useRef<HTMLCanvasElement>(null);
  const chart2Ref = useRef<HTMLCanvasElement>(null);
  const chart3Ref = useRef<HTMLCanvasElement>(null);

  // ── Smooth colour transition refs ────────────────────────────────────────
  const displayColorsRef = useRef<Float32Array>(new Float32Array(0));
  const imageDataRef = useRef<ImageData | null>(null);
  const lerpActiveRef = useRef(false);
  const lastChartRenderRef = useRef(0);

  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({
    step: 0, satisfiedPct: 0, unhappyCount: 0, movementsPerStep: 0,
    avgSameNeighborRatio: 0, segregationIndex: 0, convergence: "not stable",
    stopCondition: null,
    groupCounts: [0, 0], countEmpty: 0, clusteringIntensity: 0,
    satisfiedHistory: [], segregationHistory: [],
    initialSatisfiedPct: 0, initialSegIndex: 0,
    deltaSatisfied: 0, deltaSegIndex: 0,
    stableSteps: 0, agentsZeroNeighbors: 0,
    avgMoveDistance: 0, totalMovements: 0, tippingDetected: false,
  });

  useEffect(() => { configRef.current = config; }, [config]);

  // ── Get target RGB for a cell ─────────────────────────────────────────────
  const getCellTargetRgb = useCallback((cellVal: number, idx: number): [number, number, number] => {
    if (cellVal === RIVER)    return RIVER_RGB;
    if (cellVal === MOUNTAIN) return MOUNTAIN_RGB;
    if (cellVal === BUILDING) return BUILDING_RGB;
    if (cellVal === 0)        return EMPTY_RGB;
    const gi = cellVal - 1;
    return unhappySetRef.current.has(idx)
      ? (PALETTE_UNHAPPY_RGB[gi] ?? PALETTE_UNHAPPY_RGB[0])
      : (PALETTE_SATISFIED_RGB[gi] ?? PALETTE_SATISFIED_RGB[0]);
  }, []);

  // ── Lerp display colors toward target ────────────────────────────────────
  const lerpDisplayColors = useCallback((): boolean => {
    const cells = cellsRef.current;
    const display = displayColorsRef.current;
    let anyActive = false;

    for (let i = 0; i < cells.length; i++) {
      const base = i * 3;
      const [tr, tg, tb] = getCellTargetRgb(cells[i], i);
      const cr = display[base];
      const cg = display[base + 1];
      const cb = display[base + 2];

      const dr = tr - cr;
      const dg = tg - cg;
      const db = tb - cb;

      if (Math.abs(dr) > 0.5 || Math.abs(dg) > 0.5 || Math.abs(db) > 0.5) {
        display[base]     = cr + dr * LERP_FACTOR;
        display[base + 1] = cg + dg * LERP_FACTOR;
        display[base + 2] = cb + db * LERP_FACTOR;
        anyActive = true;
      } else {
        display[base]     = tr;
        display[base + 1] = tg;
        display[base + 2] = tb;
      }
    }

    lerpActiveRef.current = anyActive;
    return anyActive;
  }, [getCellTargetRgb]);

  // ── Render canvas from display buffer ────────────────────────────────────
  const renderCanvasFromDisplay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgData = imageDataRef.current;
    if (!imgData) return;

    const N = configRef.current.gridSize;
    const cw = canvas.width;
    const ch = canvas.height;
    const display = displayColorsRef.current;
    const data = imgData.data;

    // Fill background
    for (let p = 0; p < data.length; p += 4) {
      data[p]     = EMPTY_RGB[0];
      data[p + 1] = EMPTY_RGB[1];
      data[p + 2] = EMPTY_RGB[2];
      data[p + 3] = 255;
    }

    const cellW = cw / N;
    const cellH = ch / N;

    for (let i = 0; i < display.length / 3; i++) {
      const base = i * 3;
      const r = Math.round(display[base]);
      const g = Math.round(display[base + 1]);
      const b = Math.round(display[base + 2]);

      const row = Math.floor(i / N);
      const col = i % N;

      const px0 = Math.floor(col * cellW);
      const py0 = Math.floor(row * cellH);
      const px1 = Math.floor((col + 1) * cellW);
      const py1 = Math.floor((row + 1) * cellH);

      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const offset = (py * cw + px) * 4;
          data[offset]     = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, []);

  // ── All-charts render (throttled to ~20fps) ──────────────────────────────
  const renderAllCharts = useCallback(() => {
    const drawChart = (
      canvas: HTMLCanvasElement | null,
      series: { data: number[]; color: string }[],
      maxVal: number,
      height: number
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = height;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      // Grid lines at 25, 50, 75
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 0.5;
      [25, 50, 75].forEach(pct => {
        const y = h - (pct / maxVal) * (h - 6) - 3;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      });

      for (const s of series) {
        if (s.data.length < 2) continue;
        ctx.beginPath();
        s.data.forEach((v, i) => {
          const x = (i / (s.data.length - 1)) * w;
          const y = h - (Math.min(v, maxVal) / maxVal) * (h - 6) - 3;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    // Chart 1: % Satisfied + Segregation × 100, range 0-100
    drawChart(chart1Ref.current, [
      { data: satisfiedHistRef.current, color: "#22c55e" },
      { data: segregHistRef.current.map(v => v * 100), color: "#f97316" },
    ], 100, 80);

    // Chart 2: Unhappy % + Movements/step normalized to window max
    const movHist = movementsHistRef.current;
    const movMax = Math.max(...movHist, 1);
    drawChart(chart2Ref.current, [
      { data: unhappyHistRef.current, color: "#ef4444" },
      { data: movHist.map(v => (v / movMax) * 100), color: "#60a5fa" },
    ], 100, 64);

    // Chart 3: Avg Same-Type Ratio × 100 + Clustering × 400 clamped to 100
    drawChart(chart3Ref.current, [
      { data: avgRatioHistRef.current.map(v => v * 100), color: "#a78bfa" },
      { data: clusteringHistRef.current.map(v => Math.min(v * 400, 100)), color: "#22d3ee" },
    ], 100, 64);
  }, []);

  // ── Compute metrics ──────────────────────────────────────────────────────
  const computeMetrics = useCallback((): Metrics => {
    const cells = cellsRef.current;
    const cfg = configRef.current;
    const cache = neighborCacheRef.current;

    let satisfied = 0;
    let unhappy = 0;
    let countEmpty = 0;
    let totalRatio = 0;
    let agentCount = 0;
    let zeroNeighbors = 0;
    const ratios: number[] = [];
    const newUnhappy = new Set<number>();
    const groupCounts = new Array(cfg.numGroups).fill(0);

    for (let i = 0; i < cells.length; i++) {
      const t = cells[i];
      if (t < 0) continue;        // skip barriers
      if (t === 0) { countEmpty++; continue; }
      groupCounts[t - 1]++;
      const nbrs = cache[i] ?? [];
      const occupiedCount = nbrs.filter(n => cells[n] > 0).length;
      if (occupiedCount === 0) zeroNeighbors++;
      const ratio = sameRatioCached(i, cells, nbrs);
      ratios.push(ratio);
      totalRatio += ratio;
      agentCount++;
      if (ratio >= cfg.tolerance) satisfied++;
      else { unhappy++; newUnhappy.add(i); }
    }
    unhappySetRef.current = newUnhappy;

    const satisfiedPct = agentCount > 0 ? (satisfied / agentCount) * 100 : 0;
    const avgRatio = agentCount > 0 ? totalRatio / agentCount : 0;

    const variance = ratios.length > 0
      ? ratios.reduce((acc, r) => acc + (r - avgRatio) ** 2, 0) / ratios.length
      : 0;
    const clusteringIntensity = Math.sqrt(variance);

    // Segregation index with N-group baseline = sum(pi^2)
    const totalAgents = groupCounts.reduce((a, b) => a + b, 0) || 1;
    const baseline = groupCounts.reduce((acc, c) => acc + (c / totalAgents) ** 2, 0);
    const segregationIndex = Math.min(1, Math.max(0, (avgRatio - baseline) / (1 - baseline + 1e-9)));

    const movementsThisStep = movementsRef.current - prevMovementsRef.current;
    if (movementsThisStep === 0) stableCountRef.current++;
    else stableCountRef.current = 0;
    prevMovementsRef.current = movementsRef.current;

    let convergence: Metrics["convergence"] = "not stable";
    let stopCondition: string | null = null;
    if (satisfiedPct >= 99.9 || unhappy === 0) {
      convergence = "stable"; stopCondition = "All agents satisfied";
    } else if (stableCountRef.current >= 3) {
      convergence = "stable"; stopCondition = "No moves for 3 steps";
    } else if (stepRef.current >= cfg.maxSteps) {
      convergence = "max steps reached"; stopCondition = "Max steps reached";
    }

    satisfiedHistRef.current.push(satisfiedPct);
    segregHistRef.current.push(segregationIndex);
    unhappyHistRef.current.push(agentCount > 0 ? (unhappy / agentCount) * 100 : 0);
    movementsHistRef.current.push(movementsThisStep);
    avgRatioHistRef.current.push(avgRatio);
    clusteringHistRef.current.push(clusteringIntensity);

    if (satisfiedHistRef.current.length > MAX_HIST) satisfiedHistRef.current.shift();
    if (segregHistRef.current.length > MAX_HIST) segregHistRef.current.shift();
    if (unhappyHistRef.current.length > MAX_HIST) unhappyHistRef.current.shift();
    if (movementsHistRef.current.length > MAX_HIST) movementsHistRef.current.shift();
    if (avgRatioHistRef.current.length > MAX_HIST) avgRatioHistRef.current.shift();
    if (clusteringHistRef.current.length > MAX_HIST) clusteringHistRef.current.shift();

    const segHist = segregHistRef.current;
    const tippingDetected = segHist.length >= 10
      && Math.abs(segHist[segHist.length - 1] - segHist[segHist.length - 10]) > 0.08;

    const snap = initialSnapshotRef.current;
    const avgMoveDistance = totalMovesCountRef.current > 0
      ? totalMoveDistRef.current / totalMovesCountRef.current
      : 0;

    return {
      step: stepRef.current,
      satisfiedPct, unhappyCount: unhappy,
      movementsPerStep: movementsThisStep,
      avgSameNeighborRatio: avgRatio,
      segregationIndex, convergence, stopCondition,
      groupCounts, countEmpty,
      clusteringIntensity,
      satisfiedHistory: [...satisfiedHistRef.current],
      segregationHistory: [...segregHistRef.current],
      initialSatisfiedPct: snap.satisfiedPct,
      initialSegIndex: snap.segregationIndex,
      deltaSatisfied: satisfiedPct - snap.satisfiedPct,
      deltaSegIndex: segregationIndex - snap.segregationIndex,
      stableSteps: stableCountRef.current,
      agentsZeroNeighbors: zeroNeighbors,
      avgMoveDistance,
      totalMovements: movementsRef.current,
      tippingDetected,
    };
  }, []);

  // ── Simulation tick ───────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const cells = cellsRef.current;
    const cfg = configRef.current;
    const cache = neighborCacheRef.current;
    const rng = rngRef.current;
    const N = cfg.gridSize;

    // Only true empty cells (not barriers)
    const emptyArr: number[] = [];
    for (let i = 0; i < cells.length; i++) if (cells[i] === 0) emptyArr.push(i);

    const shuffle = (arr: number[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };

    const findTarget = (idx: number, evalCells: number[], options: number[]): number => {
      if (options.length === 0) return -1;
      const agentType = evalCells[idx];
      const currentRatio = sameRatioCached(idx, evalCells, cache[idx] ?? []);

      const evalAt = (e: number): number => {
        evalCells[e] = agentType;
        const r = sameRatioCached(e, evalCells, cache[e] ?? []);
        evalCells[e] = 0;
        return r;
      };
      const improves = (r: number) => r >= cfg.tolerance || r > currentRatio;

      if (cfg.movementRule === "random-empty") {
        const K = Math.min(options.length, 30);
        const sample = options.slice(0, K);
        for (let i = K; i < options.length; i++) {
          const j = Math.floor(rng() * (i + 1));
          if (j < K) sample[j] = options[i];
        }
        shuffle(sample);
        for (const e of sample) { if (improves(evalAt(e))) return e; }
        return sample[0];
      }

      if (cfg.movementRule === "nearest-empty") {
        const ar = Math.floor(idx / N), ac = idx % N;
        let best = -1, bestDist = Infinity;
        for (const e of options) {
          const r = evalAt(e);
          if (!improves(r)) continue;
          const d = Math.abs(Math.floor(e / N) - ar) + Math.abs((e % N) - ac);
          if (d < bestDist) { bestDist = d; best = e; }
        }
        if (best !== -1) return best;
        for (const e of options) {
          const d = Math.abs(Math.floor(e / N) - ar) + Math.abs((e % N) - ac);
          if (d < bestDist) { bestDist = d; best = e; }
        }
        return best;
      }

      // best-satisfaction
      const K = Math.min(options.length, 40);
      const sample = options.slice(0, K);
      for (let i = K; i < options.length; i++) {
        const j = Math.floor(rng() * (i + 1));
        if (j < K) sample[j] = options[i];
      }
      let bestRatio = -Infinity, bestTarget = -1;
      for (const e of sample) {
        const r = evalAt(e);
        if (r > bestRatio) { bestRatio = r; bestTarget = e; }
      }
      return (bestTarget !== -1 && improves(bestRatio)) ? bestTarget : -1;
    };

    let moved = 0;

    if (cfg.updateMethod === "asynchronous") {
      const agentIndices: number[] = [];
      for (let i = 0; i < cells.length; i++) if (cells[i] > 0) agentIndices.push(i);
      shuffle(agentIndices);

      for (const idx of agentIndices) {
        if (isSatisfiedCached(idx, cells, cache[idx] ?? [], cfg.tolerance)) continue;
        if (emptyArr.length === 0) break;

        const target = findTarget(idx, cells, emptyArr);
        if (target === -1) continue;

        const ti = emptyArr.indexOf(target);
        emptyArr[ti] = emptyArr[emptyArr.length - 1];
        emptyArr.length--;
        emptyArr.push(idx);

        const d = Math.abs(Math.floor(target / N) - Math.floor(idx / N))
                + Math.abs((target % N) - (idx % N));
        totalMoveDistRef.current += d;
        totalMovesCountRef.current++;
        cells[target] = cells[idx];
        cells[idx] = 0;
        moved++;
      }
    } else {
      const snapshot = cells.slice();
      const agentIndices: number[] = [];
      for (let i = 0; i < snapshot.length; i++) if (snapshot[i] > 0) agentIndices.push(i);
      shuffle(agentIndices);

      const claimed = new Set<number>();
      const moves: [number, number][] = [];

      for (const idx of agentIndices) {
        if (isSatisfiedCached(idx, snapshot, cache[idx] ?? [], cfg.tolerance)) continue;
        const available = emptyArr.filter(e => !claimed.has(e));
        if (available.length === 0) break;
        const target = findTarget(idx, snapshot, available);
        if (target === -1) continue;
        claimed.add(target);
        moves.push([idx, target]);
      }

      for (const [from, to] of moves) {
        const d = Math.abs(Math.floor(to / N) - Math.floor(from / N))
                + Math.abs((to % N) - (from % N));
        totalMoveDistRef.current += d;
        totalMovesCountRef.current++;
        cells[to] = cells[from];
        cells[from] = 0;
        moved++;
      }
    }

    movementsRef.current += moved;
    stepRef.current++;
  }, []);

  // ── Ensure loop is running ────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    const cfg = configRef.current;

    // Tick if running and enough time has elapsed
    if (runningRef.current && ts - lastTickRef.current >= cfg.speed) {
      tick();
      const m = computeMetrics();
      setMetrics(m);
      lastTickRef.current = ts;

      if (m.convergence === "stable" || m.convergence === "max steps reached") {
        runningRef.current = false;
        setIsRunning(false);
      }
    }

    // Always lerp + render
    lerpDisplayColors();
    renderCanvasFromDisplay();

    // Throttled chart render (~20fps)
    if (ts - lastChartRenderRef.current > 50) {
      renderAllCharts();
      lastChartRenderRef.current = ts;
    }

    // Continue loop if running or lerp still active
    if (runningRef.current || lerpActiveRef.current) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = null;
    }
  }, [tick, computeMetrics, lerpDisplayColors, renderCanvasFromDisplay, renderAllCharts]);

  const ensureLoopRunning = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  // ── Snap display colors to target (no fade) ───────────────────────────────
  const snapDisplayColors = useCallback(() => {
    const cells = cellsRef.current;
    const display = displayColorsRef.current;
    for (let i = 0; i < cells.length; i++) {
      const base = i * 3;
      const [r, g, b] = getCellTargetRgb(cells[i], i);
      display[base]     = r;
      display[base + 1] = g;
      display[base + 2] = b;
    }
    lerpActiveRef.current = false;
  }, [getCellTargetRgb]);

  // ── Init ──────────────────────────────────────────────────────────────────
  const init = useCallback((cfg: Config) => {
    rngRef.current = makeRng(cfg.seed);
    neighborCacheRef.current = buildNeighborCache(cfg.gridSize, cfg.radius);
    cellsRef.current = buildGrid(cfg, rngRef.current);
    stepRef.current = 0;
    movementsRef.current = 0;
    prevMovementsRef.current = 0;
    stableCountRef.current = 0;
    totalMoveDistRef.current = 0;
    totalMovesCountRef.current = 0;
    satisfiedHistRef.current = [];
    segregHistRef.current = [];
    unhappyHistRef.current = [];
    movementsHistRef.current = [];
    avgRatioHistRef.current = [];
    clusteringHistRef.current = [];
    unhappySetRef.current = new Set();

    const N = cfg.gridSize;
    const total = N * N;

    // Allocate display color buffer and ImageData if grid size changed
    if (displayColorsRef.current.length !== total * 3) {
      displayColorsRef.current = new Float32Array(total * 3);
      const canvas = canvasRef.current;
      if (canvas) {
        imageDataRef.current = canvas.getContext("2d")?.createImageData(CANVAS_SIZE, CANVAS_SIZE) ?? null;
      }
    }

    const cells = cellsRef.current;
    const cache = neighborCacheRef.current;
    let sat = 0, totalAgentCount = 0, sumR = 0;
    const groupCounts = new Array(cfg.numGroups).fill(0);
    for (let i = 0; i < cells.length; i++) {
      const t = cells[i];
      if (t <= 0) continue;
      groupCounts[t - 1]++;
      const r = sameRatioCached(i, cells, cache[i] ?? []);
      sumR += r; sat += r >= cfg.tolerance ? 1 : 0; totalAgentCount++;
    }
    const initSatPct = totalAgentCount > 0 ? (sat / totalAgentCount) * 100 : 0;
    const initAvgR = totalAgentCount > 0 ? sumR / totalAgentCount : 0;
    const totalAgents = groupCounts.reduce((a, b) => a + b, 0) || 1;
    const bl = groupCounts.reduce((acc, c) => acc + (c / totalAgents) ** 2, 0);
    const initSegIdx = Math.min(1, Math.max(0, (initAvgR - bl) / (1 - bl + 1e-9)));
    initialSnapshotRef.current = { satisfiedPct: initSatPct, segregationIndex: initSegIdx };

    const m = computeMetrics();
    setMetrics(m);

    // Snap display colors immediately (no fade from black)
    snapDisplayColors();

    // Start loop to render initial state and animate first settle
    ensureLoopRunning();
    renderAllCharts();
  }, [computeMetrics, snapDisplayColors, ensureLoopRunning, renderAllCharts]);

  useEffect(() => { init(configRef.current); }, [init]);
  useEffect(() => () => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Config helpers ────────────────────────────────────────────────────────
  const setParam = <K extends Exclude<keyof Config, "groupRatios" | "numGroups">>(
    key: K, val: Config[K]
  ) => {
    const next = { ...configRef.current, [key]: val };
    configRef.current = next;
    setConfig(next);
  };

  const setNumGroups = (n: number) => {
    const clamped = Math.max(2, Math.min(6, n));
    const prev = configRef.current.groupRatios;
    let ratios: number[];
    if (clamped <= prev.length) {
      ratios = prev.slice(0, clamped);
    } else {
      ratios = [...prev, ...new Array(clamped - prev.length).fill(0)];
    }
    const next: Config = { ...configRef.current, numGroups: clamped, groupRatios: ratios };
    configRef.current = next;
    setConfig(next);
  };

  const setGroupRatio = (idx: number, val: number) => {
    const current = [...configRef.current.groupRatios];
    const clampedVal = Math.max(0, Math.min(100, val));
    current[idx] = clampedVal;

    // Enforce sum <= 100: if total exceeds 100, proportionally reduce others
    const sum = current.reduce((a, b) => a + b, 0);
    if (sum > 100) {
      const excess = sum - 100;
      const otherTotal = sum - clampedVal;
      if (otherTotal > 0) {
        for (let i = 0; i < current.length; i++) {
          if (i !== idx) {
            current[i] = Math.max(0, current[i] - (current[i] / otherTotal) * excess);
            current[i] = Math.round(current[i]);
          }
        }
      }
    }

    const next: Config = { ...configRef.current, groupRatios: current };
    configRef.current = next;
    setConfig(next);
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    pause();
    const next: Config = {
      ...configRef.current,
      tolerance: p.tolerance,
      numGroups: p.numGroups,
      groupRatios: [...p.groupRatios],
      seed: p.seed,
    };
    configRef.current = next;
    setConfig(next);
    setTimeout(() => init(next), 0);
  };

  // ── Playback controls ─────────────────────────────────────────────────────
  const start = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    ensureLoopRunning();
  };
  const pause = () => {
    runningRef.current = false;
    setIsRunning(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };
  const reset = () => { pause(); init(configRef.current); };
  const stepOnce = () => {
    if (runningRef.current) return;
    tick();
    const m = computeMetrics();
    setMetrics(m);
    // Start loop to animate the transition even while paused
    ensureLoopRunning();
    renderAllCharts();
  };

  // ── Derived display values ────────────────────────────────────────────────
  const vacancyRate = Math.max(0, 100 - config.groupRatios.reduce((a, b) => a + b, 0));
  const totalAgentsDisplay = metrics.groupCounts.reduce((a, b) => a + b, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      {/* Header */}
      <header className="border-b border-[#1c1c1c] px-6 py-4">
        <div className="max-w-[1500px] mx-auto">
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Link href="/projectx" className="hover:text-white transition-colors">Project X</Link>
            <span>/</span>
            <span className="text-[#94a3b8]">Simulation 2</span>
          </nav>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Schelling Segregation Model</h1>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl leading-relaxed">
                An agent-based model demonstrating how local preference rules generate global segregation patterns — a canonical example of emergent behavior arising from decentralised, heterogeneous interactions without top-down coordination.
              </p>
              <a
                href="https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/2016/agent-based-models-understanding-the-economy-from-the-bottom-up.pdf"
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#60a5fa] hover:underline mt-1 inline-block"
              >
                Bank of England — Agent-Based Models: Understanding the Economy from the Bottom Up (2016) ↗
              </a>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`text-xs font-mono px-3 py-1.5 rounded border self-start mt-1 ${
                isRunning
                  ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                  : metrics.convergence === "stable"
                  ? "bg-blue-950 border-blue-800 text-blue-400"
                  : "bg-[#141414] border-[#2a2a2a] text-gray-400"
              }`}>
                {isRunning ? "● RUNNING" : metrics.convergence === "stable" ? "◆ CONVERGED" : "■ PAUSED"}
              </span>
              {metrics.tippingDetected && (
                <span className="text-xs font-mono px-3 py-1.5 rounded border bg-amber-950 border-amber-700 text-amber-400">
                  ⚡ TIPPING POINT
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1500px] mx-auto p-4 flex flex-col gap-4">

        {/* Main row: canvas + metrics */}
        <div className="flex gap-4 items-start">

          {/* Grid visualization */}
          <div className="flex-shrink-0">
            <div
              className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg overflow-hidden"
              style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{ display: "block", width: CANVAS_SIZE, height: CANVAS_SIZE }}
              />
            </div>

            {/* Legend */}
            <div className="mt-2 px-1">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Array.from({ length: config.numGroups }, (_, gi) => (
                  <span key={gi} className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span
                        className="w-3 h-3 rounded-sm inline-block"
                        style={{ backgroundColor: GROUP_COLORS_SATISFIED[gi] }}
                      />
                      {GROUP_LABELS[gi]} sat.
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span
                        className="w-3 h-3 rounded-sm inline-block"
                        style={{ backgroundColor: GROUP_COLORS_UNHAPPY[gi] }}
                      />
                      unhappy
                    </span>
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-3 rounded-sm inline-block bg-[#1c1c1c] border border-[#333]" />
                  empty
                </span>
              </div>
              {/* Barriers legend row */}
              <div className="flex items-center gap-4 mt-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-600 flex-shrink-0">Barriers</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: `rgb(${RIVER_RGB[0]},${RIVER_RGB[1]},${RIVER_RGB[2]})` }}
                  />
                  river
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: `rgb(${MOUNTAIN_RGB[0]},${MOUNTAIN_RGB[1]},${MOUNTAIN_RGB[2]})` }}
                  />
                  mountain
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: `rgb(${BUILDING_RGB[0]},${BUILDING_RGB[1]},${BUILDING_RGB[2]})` }}
                  />
                  building
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {totalAgentsDisplay.toLocaleString()} agents · {metrics.countEmpty.toLocaleString()} empty
              </div>
            </div>
          </div>

          {/* Metrics panel */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">

            {/* Stat grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Time Step", value: metrics.step.toLocaleString(), color: "text-white", sub: null },
                {
                  label: "Satisfied Agents",
                  value: `${metrics.satisfiedPct.toFixed(1)}%`,
                  color: metrics.satisfiedPct > 80 ? "text-emerald-400" : metrics.satisfiedPct > 50 ? "text-yellow-400" : "text-red-400",
                  sub: null,
                },
                {
                  label: "Unhappy Agents",
                  value: metrics.unhappyCount.toLocaleString(),
                  color: metrics.unhappyCount === 0 ? "text-emerald-400" : "text-red-400",
                  sub: null,
                },
                {
                  label: "Movements / Step",
                  value: metrics.movementsPerStep.toLocaleString(),
                  color: "text-[#60a5fa]",
                  sub: null,
                },
                {
                  label: "Avg Same-Type Ratio",
                  value: metrics.avgSameNeighborRatio.toFixed(3),
                  color: "text-[#a78bfa]",
                  sub: null,
                },
                {
                  label: "Segregation Index",
                  value: metrics.segregationIndex.toFixed(3),
                  color: metrics.segregationIndex > 0.6 ? "text-red-400" : metrics.segregationIndex > 0.3 ? "text-yellow-400" : "text-emerald-400",
                  sub: null,
                },
                {
                  label: "Convergence",
                  value: metrics.convergence === "stable" ? "Stable" : metrics.convergence === "max steps reached" ? "Max Steps" : "Running",
                  color: metrics.convergence === "stable" ? "text-emerald-400" : metrics.convergence === "max steps reached" ? "text-yellow-400" : "text-gray-400",
                  sub: metrics.stopCondition ?? undefined,
                },
                {
                  label: "Clustering Intensity",
                  value: metrics.clusteringIntensity.toFixed(3),
                  color: "text-[#f97316]",
                  sub: "σ of local ratios",
                },
                {
                  label: "Total Movements",
                  value: metrics.totalMovements.toLocaleString(),
                  color: "text-gray-300",
                  sub: null,
                },
                {
                  label: "Avg Move Distance",
                  value: metrics.avgMoveDistance.toFixed(1),
                  color: "text-gray-300",
                  sub: "Manhattan units",
                },
                {
                  label: "Δ Satisfied",
                  value: `${metrics.deltaSatisfied >= 0 ? "+" : ""}${metrics.deltaSatisfied.toFixed(1)}%`,
                  color: metrics.deltaSatisfied >= 0 ? "text-emerald-400" : "text-red-400",
                  sub: "vs t=0",
                },
                {
                  label: "Δ Segregation",
                  value: `${metrics.deltaSegIndex >= 0 ? "+" : ""}${metrics.deltaSegIndex.toFixed(3)}`,
                  color: metrics.deltaSegIndex > 0 ? "text-red-400" : "text-emerald-400",
                  sub: "vs t=0",
                },
              ].map(s => (
                <div key={s.label} className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 leading-tight">{s.label}</div>
                  <div className={`text-lg font-mono font-semibold ${s.color}`}>{s.value}</div>
                  {s.sub && <div className="text-[9px] text-gray-600 mt-0.5">{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Population distribution */}
            <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Population Distribution</div>
              <div className="flex gap-0.5 h-4 rounded overflow-hidden">
                {(() => {
                  const total = totalAgentsDisplay + metrics.countEmpty || 1;
                  return (
                    <>
                      {metrics.groupCounts.map((count, gi) => (
                        <div
                          key={gi}
                          className="transition-all duration-300"
                          style={{
                            width: `${(count / total) * 100}%`,
                            backgroundColor: GROUP_COLORS_SATISFIED[gi],
                          }}
                          title={`${GROUP_LABELS[gi]}: ${count}`}
                        />
                      ))}
                      <div
                        className="bg-[#1c1c1c] flex-1"
                        title={`Empty: ${metrics.countEmpty}`}
                      />
                    </>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] text-gray-500">
                {metrics.groupCounts.map((count, gi) => {
                  const total = totalAgentsDisplay + metrics.countEmpty || 1;
                  return (
                    <span key={gi} style={{ color: GROUP_COLORS_SATISFIED[gi] }}>
                      G{gi + 1}: {((count / total) * 100).toFixed(1)}%
                    </span>
                  );
                })}
                <span>
                  Empty: {((metrics.countEmpty / (totalAgentsDisplay + metrics.countEmpty || 1)) * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Three time-series charts */}
            <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg p-3 flex flex-col gap-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">Metrics Over Time</div>

              {/* Chart 1 */}
              <div>
                <div className="flex gap-4 mb-1">
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#22c55e]" /> % Satisfied
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#f97316]" /> Segregation Index × 100
                  </span>
                </div>
                <canvas
                  ref={chart1Ref}
                  width={500}
                  height={80}
                  className="w-full rounded h-20"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>t=0</span><span>t={metrics.step}</span>
                </div>
              </div>

              {/* Chart 2 */}
              <div>
                <div className="flex gap-4 mb-1">
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#ef4444]" /> Unhappy %
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#60a5fa]" /> Movements/step (norm.)
                  </span>
                </div>
                <canvas
                  ref={chart2Ref}
                  width={500}
                  height={64}
                  className="w-full rounded h-16"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>t=0</span><span>t={metrics.step}</span>
                </div>
              </div>

              {/* Chart 3 */}
              <div>
                <div className="flex gap-4 mb-1">
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#a78bfa]" /> Avg Same-Type Ratio × 100
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="w-4 h-0.5 inline-block bg-[#22d3ee]" /> Clustering Intensity × 400
                  </span>
                </div>
                <canvas
                  ref={chart3Ref}
                  width={500}
                  height={64}
                  className="w-full rounded h-16"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>t=0</span><span>t={metrics.step}</span>
                </div>
              </div>
            </div>

            {/* Rules panel */}
            <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Model Rules</div>
              <ul className="text-xs text-gray-400 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="text-[#444]">·</span> Grid-based spatial environment with randomly generated city barriers</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> {config.numGroups} agent group{config.numGroups > 1 ? "s" : ""} + empty cells (barriers are impassable)</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> Local Moore neighbourhood evaluation (radius r)</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> Satisfied if same-type fraction ≥ tolerance f</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> Unhappy agents relocate to an empty cell</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> Iteration until convergence or max steps</li>
                <li className="flex gap-2"><span className="text-[#444]">·</span> Emergent macro-segregation from micro-preferences</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Controls panel */}
        <div className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-lg p-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Simulation Controls</div>

          {/* Paper presets */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#1c1c1c]">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 flex-shrink-0">Paper Presets</span>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                  config.tolerance === p.tolerance
                  && config.numGroups === p.numGroups
                  && JSON.stringify(config.groupRatios) === JSON.stringify(p.groupRatios)
                    ? "bg-[#1d3557] border-[#2a4a7f] text-[#60a5fa]"
                    : "bg-[#141414] border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#3a3a3a]"
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="text-[10px] text-gray-600 ml-auto">
              f=0.25 stays mixed · f=0.26 triggers segregation (tipping point) · f=0.70 strong segregation
            </span>
          </div>

          <div className="flex gap-6">

            {/* Sliders col */}
            <div className="flex-1 flex flex-col gap-4">

              {/* Number of groups slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-400">Number of Groups</label>
                  <span className="text-xs font-mono text-white bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#2a2a2a]">
                    {config.numGroups}
                  </span>
                </div>
                <input
                  type="range" min={2} max={6} step={1}
                  value={config.numGroups}
                  onChange={e => setNumGroups(+e.target.value)}
                  title="Number of Groups"
                  className="w-full h-1 rounded-full appearance-none cursor-pointer accent-[#60a5fa]"
                />
              </div>

              {/* Per-group ratio sliders */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {Array.from({ length: config.numGroups }, (_, gi) => (
                  <div key={gi}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs" style={{ color: GROUP_COLORS_SATISFIED[gi] }}>
                        {GROUP_LABELS[gi]} (%)
                      </label>
                      <span className="text-xs font-mono text-white bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#2a2a2a]">
                        {config.groupRatios[gi] ?? 0}%
                      </span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={config.groupRatios[gi] ?? 0}
                      onChange={e => setGroupRatio(gi, +e.target.value)}
                      title={`${GROUP_LABELS[gi]} ratio`}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: GROUP_COLORS_SATISFIED[gi] }}
                    />
                  </div>
                ))}
              </div>

              {/* Vacancy derived */}
              <div className="text-xs text-gray-500">
                Vacancy rate: <span className="text-gray-300 font-mono">{vacancyRate}%</span>
                {" "}(= 100 – sum of group ratios)
              </div>

              {/* Remaining sliders */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-2 border-t border-[#1c1c1c]">
                {([
                  { key: "gridSize",  label: "Grid Size",            min: 20,  max: 100,   step: 5,   fmt: (v: number) => `${v}×${v}` },
                  { key: "tolerance", label: "Tolerance (f)",        min: 0,   max: 1,     step: 0.01, fmt: (v: number) => v.toFixed(2) },
                  { key: "radius",    label: "Neighbourhood Radius", min: 1,   max: 5,     step: 1,   fmt: (v: number) => `r=${v}` },
                  { key: "speed",     label: "Speed (ms/step)",      min: 10,  max: 500,   step: 10,  fmt: (v: number) => `${v}ms` },
                  { key: "maxSteps",  label: "Max Steps",            min: 100, max: 10000, step: 100, fmt: (v: number) => v.toLocaleString() },
                  { key: "seed",      label: "Random Seed",          min: 0,   max: 9999,  step: 1,   fmt: (v: number) => String(v) },
                ] as { key: Exclude<keyof Config, "groupRatios" | "numGroups">; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[]).map(sl => (
                  <div key={sl.key}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-gray-400">{sl.label}</label>
                      <span className="text-xs font-mono text-white bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#2a2a2a]">
                        {sl.fmt(config[sl.key] as number)}
                      </span>
                    </div>
                    <input
                      type="range" min={sl.min} max={sl.max} step={sl.step}
                      value={config[sl.key] as number}
                      onChange={e => setParam(sl.key, +e.target.value as Config[typeof sl.key])}
                      title={sl.label}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer accent-[#60a5fa]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px bg-[#1c1c1c] self-stretch" />

            {/* Dropdowns */}
            <div className="w-52 flex-shrink-0 flex flex-col gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Update Method</div>
                {(["asynchronous", "synchronous"] as UpdateMethod[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setParam("updateMethod", m)}
                    className={`w-full text-left px-3 py-2 rounded text-xs font-medium mb-1.5 transition-colors ${
                      config.updateMethod === m
                        ? "bg-[#1d3557] border border-[#2a4a7f] text-[#60a5fa]"
                        : "bg-[#141414] border border-[#2a2a2a] text-gray-400 hover:text-white"
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Movement Rule</div>
                {([
                  ["nearest-empty",    "Nearest Empty"],
                  ["random-empty",     "Random Empty"],
                  ["best-satisfaction","Best Satisfaction"],
                ] as [MovementRule, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setParam("movementRule", val)}
                    className={`w-full text-left px-3 py-2 rounded text-xs font-medium mb-1.5 transition-colors ${
                      config.movementRule === val
                        ? "bg-[#1d3557] border border-[#2a4a7f] text-[#60a5fa]"
                        : "bg-[#141414] border border-[#2a2a2a] text-gray-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-gray-600 pt-1">
                Vacancy rate: <span className="text-gray-400">{vacancyRate}%</span>
              </div>
            </div>

            <div className="w-px bg-[#1c1c1c] self-stretch" />

            {/* Action buttons */}
            <div className="flex flex-col gap-2 w-36 flex-shrink-0 justify-center">
              <button
                type="button"
                onClick={start}
                disabled={isRunning}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
              >
                <span>▶</span> Start
              </button>
              <button
                type="button"
                onClick={pause}
                disabled={!isRunning}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-amber-800 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
              >
                <span>⏸</span> Pause
              </button>
              <button
                type="button"
                onClick={stepOnce}
                disabled={isRunning}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-[#1a1a2e] hover:bg-[#252545] disabled:opacity-40 disabled:cursor-not-allowed text-white border border-[#2a2a4a] flex items-center justify-center gap-2"
              >
                <span>⏭</span> Step
              </button>
              <button
                type="button"
                onClick={reset}
                className="py-2.5 rounded text-sm font-medium transition-colors bg-[#141414] hover:bg-[#1e1e1e] text-gray-300 hover:text-white border border-[#2a2a2a] flex items-center justify-center gap-2"
              >
                <span>↺</span> Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
