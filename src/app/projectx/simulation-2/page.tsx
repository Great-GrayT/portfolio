"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import katex from "katex";
import "katex/dist/katex.min.css";

// ─── Cell type constants ──────────────────────────────────────────────────────
const EMPTY       = 0;
const RESIDENTIAL = 1;
const COMMERCIAL  = 2;
const ROAD        = 3;
const RIVER       = 4;
const MOUNTAIN    = 5;
const BLOCKED     = 6;

const CANVAS_SIZE = 620;
const MAX_HIST    = 300;
const LERP_FACTOR = 0.15;

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Household {
  group: number;          // Schelling group identity g_h ∈ {0,…,G-1}
  moneyIq: number;
  age: number;
  deathAge: number;
  income: number;
  wealth: number;
  savingPropensity: number;
  utility: number;        // current utility U_h(x_h)
  satisfaction: number;   // income-band social fit Q_h ∈ [0,1]
  groupFit: number;       // Schelling group-composition fit s_h(x) − τ_G
  loanRemaining: number;  // installment steps remaining (0 = none)
  loanPayment: number;    // per-step installment obligation
}

interface Config {
  // Map
  gridSize: number;
  riverAmount: number;
  mountainAmount: number;
  blockedAmount: number;
  commercialCount: number;
  commercialCompactness: number;
  roadDensity: number;
  populationDensity: number;
  // Lifecycle
  maxAge: number;
  avgDeathAge: number;
  // Income
  baseIncome: number;
  moneyIqEffect: number;
  accessibilityIncomeEffect: number;
  // Price
  basePrice: number;
  accessibilityPriceEffect: number;
  densityPriceEffect: number;
  demandPriceEffect: number;
  demandDecay: number;
  // Inheritance
  inheritanceRetention: number;
  moneyIqPersistence: number;
  // Payment mode
  paymentMode: "full" | "installment";
  installmentN: number;
  installmentM: number;
  // Utility weights
  lambdaC: number;
  lambdaH: number;
  lambdaA: number;
  lambdaN: number;
  lambdaS: number;
  lambdaT: number;
  lambdaF: number;
  // Affordability & costs
  affordabilityKappa: number;
  basicCost: number;
  commuteCostFactor: number;
  // Move decision
  utilityThreshold: number;
  movingCostBase: number;
  movingCostDist: number;
  // Schelling groups
  numGroups: number;
  groupTolerance: number;
  lambdaG: number;
  // Simulation
  speed: number;
  maxSteps: number;
  seed: number;
  colorMode: "income" | "wealth" | "age" | "utility" | "group";
}

interface AccessMaps {
  distToCommercial: Float32Array;
  distToRoad: Float32Array;
  localCommercialDensity: Float32Array;
  housingServiceMap: Float32Array;      // H(x): static terrain-based quality proxy
  neighborhoodQualityMap: Float32Array; // NQ(x): green, river amenity, blocked penalty
}

interface Metrics {
  step: number;
  avgIncome: number;
  avgWealth: number;
  avgAge: number;
  avgLocalPrice: number;
  avgAccessibility: number;
  avgUtility: number;
  avgConsumption: number;
  avgHousingPayment: number;
  pctAffordable: number;
  movesThisStep: number;
  deathsThisStep: number;
  totalDeaths: number;
  incomeInequalityGini: number;
  spatialSegregation: number;
  avgDistCommercial: number;
  avgDistRoad: number;
  householdCount: number;
  // Schelling group metrics
  avgSameGroupExposure: number;
  groupSegIndex: number;
  // History arrays
  avgIncomeHistory: number[];
  avgWealthHistory: number[];
  avgAgeHistory: number[];
  avgUtilityHistory: number[];
  avgConsumptionHistory: number[];
  pctMoveHistory: number[];
  incomeInequalityHistory: number[];
  spatialSegHistory: number[];
  avgPriceHistory: number[];
  deathsHistory: number[];
  accessibilityHistory: number[];
  avgSameGroupHistory: number[];
  groupSegHistory2: number[];
}

// ─── Default config ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG: Config = {
  gridSize: 75,
  riverAmount: 2,
  mountainAmount: 2,
  blockedAmount: 1,
  commercialCount: 3,
  commercialCompactness: 0.7,
  roadDensity: 1.0,
  populationDensity: 0.4,
  maxAge: 90,
  avgDeathAge: 72,
  baseIncome: 50,
  moneyIqEffect: 0.5,
  accessibilityIncomeEffect: 0.3,
  basePrice: 10,
  accessibilityPriceEffect: 20,
  densityPriceEffect: 5,
  demandPriceEffect: 8,
  demandDecay: 0.9,
  inheritanceRetention: 0.8,
  moneyIqPersistence: 0.5,
  paymentMode: "installment",
  installmentN: 12,
  installmentM: 0.02,
  lambdaC: 0.35,
  lambdaH: 0.10,
  lambdaA: 0.20,
  lambdaN: 0.15,
  lambdaS: 0.10,
  lambdaT: 0.10,
  lambdaF: 0.15,
  affordabilityKappa: 0.40,
  basicCost: 5,
  commuteCostFactor: 0.15,
  utilityThreshold: 0.05,
  movingCostBase: 0.10,
  movingCostDist: 0.10,
  numGroups: 2,
  groupTolerance: 0.30,
  lambdaG: 0.15,
  speed: 120,
  maxSteps: 5000,
  seed: 42,
  colorMode: "income",
};

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussRng(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Map generation ──────────────────────────────────────────────────────────
function generateRivers(grid: Uint8Array, N: number, count: number, rng: () => number): void {
  for (let r = 0; r < count; r++) {
    const startEdge = Math.floor(rng() * 4);
    let row: number, col: number;
    let primaryDr: number, primaryDc: number;
    if (startEdge === 0) { row = 0; col = Math.floor(rng() * N); primaryDr = 1; primaryDc = 0; }
    else if (startEdge === 1) { row = N - 1; col = Math.floor(rng() * N); primaryDr = -1; primaryDc = 0; }
    else if (startEdge === 2) { row = Math.floor(rng() * N); col = 0; primaryDr = 0; primaryDc = 1; }
    else { row = Math.floor(rng() * N); col = N - 1; primaryDr = 0; primaryDc = -1; }
    const width = 1 + Math.floor(rng() * 2);
    let steps = 0;
    while (steps < N * 3 && row >= 0 && row < N && col >= 0 && col < N) {
      for (let wr = -Math.floor(width / 2); wr <= Math.floor(width / 2); wr++) {
        for (let wc = -Math.floor(width / 2); wc <= Math.floor(width / 2); wc++) {
          const nr = row + wr, nc = col + wc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) grid[nr * N + nc] = RIVER;
        }
      }
      const rand = rng();
      if (rand < 0.72) { row += primaryDr; col += primaryDc; }
      else if (rand < 0.86) { row += primaryDc; col += primaryDr; }
      else { row -= primaryDc; col -= primaryDr; }
      steps++;
    }
  }
}

function generateMountains(grid: Uint8Array, N: number, count: number, rng: () => number): void {
  for (let m = 0; m < count; m++) {
    const cy = Math.floor(rng() * N);
    const cx = Math.floor(rng() * N);
    const radius = Math.floor(N * 0.07) + Math.floor(rng() * Math.floor(N * 0.05)) + 3;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r * N + c] !== EMPTY) continue;
        const dist = Math.sqrt((r - cy) ** 2 + (c - cx) ** 2);
        const noise = (rng() - 0.5) * radius * 0.7;
        if (dist + noise < radius) grid[r * N + c] = MOUNTAIN;
      }
    }
  }
}

function generateCommercial(
  grid: Uint8Array, N: number, count: number, compactness: number, rng: () => number
): [number, number][] {
  const centers: [number, number][] = [];
  const baseRadius = Math.max(3, Math.floor(N * 0.05));
  for (let k = 0; k < count; k++) {
    let cy = 0, cx = 0, ok = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      cy = 3 + Math.floor(rng() * (N - 6));
      cx = 3 + Math.floor(rng() * (N - 6));
      if (grid[cy * N + cx] !== EMPTY) continue;
      const tooClose = centers.some(([cr, cc]) => Math.sqrt((cy - cr) ** 2 + (cx - cc) ** 2) < baseRadius * 3);
      if (!tooClose) { ok = true; break; }
    }
    if (!ok) continue;
    centers.push([cy, cx]);
    const maxR = baseRadius + Math.floor(rng() * 3);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r * N + c] !== EMPTY) continue;
        const dist = Math.sqrt((r - cy) ** 2 + (c - cx) ** 2);
        const sigma = maxR * compactness;
        const prob = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        if (rng() < prob * 1.4) grid[r * N + c] = COMMERCIAL;
      }
    }
  }
  return centers;
}

// ─── Binary min-heap ──────────────────────────────────────────────────────────
class MinHeap {
  private d: Float32Array;
  private id: Int32Array;
  private sz = 0;
  constructor(capacity: number) { this.d = new Float32Array(capacity); this.id = new Int32Array(capacity); }
  push(cost: number, idx: number) {
    let i = this.sz++;
    this.d[i] = cost; this.id[i] = idx;
    while (i > 0) { const p = (i - 1) >> 1; if (this.d[p] <= this.d[i]) break; this._swap(p, i); i = p; }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.d[0], this.id[0]];
    const last = --this.sz;
    if (last > 0) { this.d[0] = this.d[last]; this.id[0] = this.id[last]; this._sink(0); }
    return top;
  }
  get empty() { return this.sz === 0; }
  private _swap(a: number, b: number) {
    const t = this.d[a]; this.d[a] = this.d[b]; this.d[b] = t;
    const u = this.id[a]; this.id[a] = this.id[b]; this.id[b] = u;
  }
  private _sink(i: number) {
    while (true) {
      let s = i; const l = 2 * i + 1, r = 2 * i + 2;
      if (l < this.sz && this.d[l] < this.d[s]) s = l;
      if (r < this.sz && this.d[r] < this.d[s]) s = r;
      if (s === i) break;
      this._swap(s, i); i = s;
    }
  }
}

function dijkstraPath(N: number, grid: Uint8Array, start: number, end: number): number[] {
  const total = N * N;
  const dist = new Float32Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  dist[start] = 0;
  const heap = new MinHeap(total * 2);
  heap.push(0, start);
  const DIRS = [-N, N, -1, 1];
  while (!heap.empty) {
    const [d, idx] = heap.pop();
    if (d > dist[idx]) continue;
    if (idx === end) break;
    const c = idx % N;
    for (const dir of DIRS) {
      const ni = idx + dir;
      if (ni < 0 || ni >= total) continue;
      const nc = ni % N;
      if (dir === -1 && nc !== c - 1) continue;
      if (dir ===  1 && nc !== c + 1) continue;
      const ct = grid[ni];
      const cost = (ct === RIVER || ct === MOUNTAIN || ct === BLOCKED) ? 800
                 : ct === COMMERCIAL ? 4 : ct === ROAD ? 0.3 : 1;
      const nd = d + cost;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni); }
    }
  }
  const path: number[] = [];
  let cur = end;
  while (cur !== -1 && cur !== start) { path.push(cur); cur = prev[cur]; }
  if (cur === start) path.push(start);
  return path;
}

function generateRoads(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  grid: Uint8Array, N: number, centers: [number, number][], roadDensity: number, _rng: () => number
): void {
  const anchors: number[] = centers.map(([r, c]) => r * N + c);
  const mid = Math.floor(N / 2);
  anchors.push(mid, (N - 1) * N + mid, mid * N, mid * N + N - 1);
  const validAnchors = anchors.filter(a => { const t = grid[a]; return t === EMPTY || t === COMMERCIAL || t === ROAD; });
  if (validAnchors.length < 2) return;
  const n = validAnchors.length;
  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const ri = Math.floor(validAnchors[i] / N), ci = validAnchors[i] % N;
    const rj = Math.floor(validAnchors[j] / N), cj = validAnchors[j] % N;
    edges.push([Math.abs(ri - rj) + Math.abs(ci - cj), i, j]);
  }
  edges.sort((a, b) => a[0] - b[0]);
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  const mstEdges: [number, number][] = [];
  for (const [, i, j] of edges) {
    const pi = find(i), pj = find(j);
    if (pi !== pj) { parent[pi] = pj; mstEdges.push([validAnchors[i], validAnchors[j]]); if (mstEdges.length === n - 1) break; }
  }
  const extraEdges = Math.floor((roadDensity - 0.5) * n);
  for (let e = 0; e < extraEdges && e < edges.length; e++) {
    const [, i, j] = edges[e + Math.floor(edges.length * 0.3)];
    if (i < validAnchors.length && j < validAnchors.length) mstEdges.push([validAnchors[i], validAnchors[j]]);
  }
  for (const [a, b] of mstEdges) {
    const path = dijkstraPath(N, grid, a, b);
    for (const idx of path) if (grid[idx] === EMPTY) grid[idx] = ROAD;
  }
}

function generateMap(cfg: Config, rng: () => number): { grid: Uint8Array; commercialCenters: [number, number][] } {
  const N = cfg.gridSize;
  const grid = new Uint8Array(N * N);
  generateRivers(grid, N, cfg.riverAmount, rng);
  generateMountains(grid, N, cfg.mountainAmount, rng);
  for (let b = 0; b < cfg.blockedAmount; b++) {
    const w = 3 + Math.floor(rng() * 5), h = 3 + Math.floor(rng() * 5);
    const bx = Math.floor(rng() * Math.max(1, N - w));
    const by = Math.floor(rng() * Math.max(1, N - h));
    for (let r = by; r < by + h; r++) for (let c = bx; c < bx + w; c++)
      if (r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c] === EMPTY) grid[r * N + c] = BLOCKED;
  }
  const commercialCenters = generateCommercial(grid, N, cfg.commercialCount, cfg.commercialCompactness, rng);
  generateRoads(grid, N, commercialCenters, cfg.roadDensity, rng);
  return { grid, commercialCenters };
}

// ─── Access + terrain quality maps ───────────────────────────────────────────
function buildAccessMaps(grid: Uint8Array, N: number): AccessMaps {
  const total = N * N;

  function wmsD(sources: number[]): Float32Array {
    const dist = new Float32Array(total).fill(Infinity);
    const heap = new MinHeap(total * 4);
    for (const s of sources) { dist[s] = 0; heap.push(0, s); }
    const DIRS = [-N, N, -1, 1];
    while (!heap.empty) {
      const [d, idx] = heap.pop();
      if (d > dist[idx]) continue;
      const c = idx % N;
      for (const dir of DIRS) {
        const ni = idx + dir;
        if (ni < 0 || ni >= total) continue;
        const nc = ni % N;
        if (dir === -1 && nc !== c - 1) continue;
        if (dir ===  1 && nc !== c + 1) continue;
        const ct = grid[ni];
        if (ct === RIVER || ct === MOUNTAIN || ct === BLOCKED) continue;
        const nd = d + (ct === ROAD ? 0.5 : 1.0);
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(nd, ni); }
      }
    }
    return dist;
  }

  const commSrc: number[] = [], roadSrc: number[] = [];
  for (let i = 0; i < total; i++) {
    if (grid[i] === COMMERCIAL) commSrc.push(i);
    if (grid[i] === ROAD)       roadSrc.push(i);
  }

  const distToCommercial = wmsD(commSrc);
  const distToRoad       = wmsD(roadSrc);

  // Local commercial density
  const localCommercialDensity = new Float32Array(total);
  const DR = 5, area = (2 * DR + 1) ** 2;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let cnt = 0;
    for (let dr = -DR; dr <= DR; dr++) for (let dc = -DR; dc <= DR; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr * N + nc] === COMMERCIAL) cnt++;
    }
    localCommercialDensity[r * N + c] = cnt / area;
  }

  // H(x): housing-service quality — mountain proximity (green/quiet) + river nearness
  const housingServiceMap = new Float32Array(total);
  const DR2 = 7, area2 = (2 * DR2 + 1) ** 2 - 1;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let mountCnt = 0, riverCnt = 0;
    for (let dr = -DR2; dr <= DR2; dr++) for (let dc = -DR2; dc <= DR2; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        const t = grid[nr * N + nc];
        if (t === MOUNTAIN) mountCnt++;
        if (t === RIVER)    riverCnt++;
      }
    }
    const green = mountCnt / area2;
    const riverNear = Math.min(1, riverCnt / area2 * 15);
    housingServiceMap[r * N + c] = Math.max(0.1, 1 + 2 * green + 0.3 * riverNear);
  }

  // NQ(x): neighborhood quality — green amenity, modest river amenity, blocked penalty
  const neighborhoodQualityMap = new Float32Array(total);
  const DR3 = 5, area3 = (2 * DR3 + 1) ** 2 - 1;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let mountCnt = 0, riverCnt = 0, blockCnt = 0;
    for (let dr = -DR3; dr <= DR3; dr++) for (let dc = -DR3; dc <= DR3; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        const t = grid[nr * N + nc];
        if (t === MOUNTAIN) mountCnt++;
        if (t === RIVER)    riverCnt++;
        if (t === BLOCKED)  blockCnt++;
      }
    }
    neighborhoodQualityMap[r * N + c] =
      0.5 * (mountCnt / area3)
      + 0.3 * Math.min(1, riverCnt / area3 * 12)
      - 0.6 * (blockCnt / area3);
  }

  return { distToCommercial, distToRoad, localCommercialDensity, housingServiceMap, neighborhoodQualityMap };
}

// ─── Economic functions ───────────────────────────────────────────────────────
function accessibility(idx: number, maps: AccessMaps, N: number): number {
  const w1 = 0.4, w2 = 0.3, w3 = 0.3;
  const scale = N * 0.12;
  const invNormCom  = 1 / (1 + (isFinite(maps.distToCommercial[idx]) ? maps.distToCommercial[idx] : N) / scale);
  const invNormRoad = 1 / (1 + (isFinite(maps.distToRoad[idx])       ? maps.distToRoad[idx]       : N) / (scale * 0.5));
  return w1 * invNormCom + w2 * invNormRoad + w3 * Math.min(1, maps.localCommercialDensity[idx] * 25);
}

function ageIncomeFactor(age: number, maxAge: number): number {
  if (age < 18) return 0.2;
  if (age < 45) return 0.2 + 0.8 * (age - 18) / 27;
  if (age < 60) return 1.0;
  return Math.max(0.1, 1.0 - 0.5 * (age - 60) / Math.max(1, maxAge - 60));
}

function computeIncome(h: Household, acc: number, cfg: Config, noise: number): number {
  const g = ageIncomeFactor(h.age, cfg.maxAge);
  return Math.max(0, cfg.baseIncome * (1 + cfg.moneyIqEffect * h.moneyIq) * (1 + cfg.accessibilityIncomeEffect * acc) * g + noise);
}

function localPopDensity(idx: number, grid: Uint8Array, N: number): number {
  const r = Math.floor(idx / N), c = idx % N;
  const DR = 3; let cnt = 0;
  for (let dr = -DR; dr <= DR; dr++) for (let dc = -DR; dc <= DR; dc++) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr * N + nc] === RESIDENTIAL) cnt++;
  }
  return cnt / ((2 * DR + 1) ** 2);
}

function computePrice(acc: number, popDen: number, cfg: Config, demand = 0): number {
  return Math.max(0, cfg.basePrice + cfg.accessibilityPriceEffect * acc + cfg.densityPriceEffect * popDen + cfg.demandPriceEffect * demand);
}

// ─── Installment payment formula ──────────────────────────────────────────────
// Standard level-payment amortization: Pay = P · m(1+m)^N / ((1+m)^N - 1)
function installmentPayment(price: number, N: number, m: number): number {
  if (N <= 0) return price;
  if (m === 0) return price / N;
  const factor = Math.pow(1 + m, N);
  return price * (m * factor) / (factor - 1);
}

// ─── Group palette ────────────────────────────────────────────────────────────
const GROUP_COLORS: [number, number, number][] = [
  [20,  180, 220],  // 0: cyan
  [220, 110,  20],  // 1: orange
  [ 50, 200,  80],  // 2: green
  [200,  40, 180],  // 3: magenta
  [220, 200,  20],  // 4: yellow
  [140,  50, 220],  // 5: purple
  [220,  40,  40],  // 6: red
  [ 20, 200, 160],  // 7: teal
];

// ─── Schelling group-composition fit ─────────────────────────────────────────
// Returns s_h(x) − τ_G where s_h(x) = same-group share among occupied neighbours
function computeGroupFit(
  idx: number, hGroup: number, grid: Uint8Array, households: Map<number, Household>, N: number, tolerance: number
): number {
  const r = Math.floor(idx / N), c = idx % N;
  let same = 0, occupied = 0;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) {
        occupied++;
        const nh = households.get(ni);
        if (nh && nh.group === hGroup) same++;
      }
    }
  }
  const sameShare = occupied === 0 ? 0.5 : same / occupied;
  return sameShare - tolerance;
}

// ─── Social fit (income-band similarity, kept alongside group fit) ─────────────
function computeSocialFit(
  idx: number, h: Household, grid: Uint8Array, households: Map<number, Household>, N: number
): number {
  const r = Math.floor(idx / N), c = idx % N;
  let similar = 0, occupied = 0;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) {
        occupied++;
        const nh = households.get(ni);
        if (nh && Math.abs(h.income - nh.income) / Math.max(1, Math.abs(h.income) + 1) < 0.35) similar++;
      }
    }
  }
  return occupied === 0 ? 0.5 : similar / occupied;
}

// ─── Full utility function U_h(x) ────────────────────────────────────────────
// U_h(x) = λC·ln(max(ε, C_h(x))) + λH·ln(H(x)) + λA·A(x)
//         + λN·NQ(x) + λS·Q_h(x) − λT·T(x) − λF·max(0, Pay−κY)
function computeUtilityAt(
  idx: number,
  h: Household,
  housingCost: number, // per-step cost at this location
  grid: Uint8Array,
  households: Map<number, Household>,
  N: number,
  cfg: Config,
  maps: AccessMaps
): number {
  const acc  = accessibility(idx, maps, N);
  const dCom = maps.distToCommercial[idx];
  const T    = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
  const commuteCost = cfg.commuteCostFactor * T * h.income;
  const C    = Math.max(1e-6, h.income - housingCost - commuteCost - cfg.basicCost);
  const H    = maps.housingServiceMap[idx];
  const NQ   = maps.neighborhoodQualityMap[idx];
  const SF   = computeSocialFit(idx, h, grid, households, N);
  const GF   = computeGroupFit(idx, h.group, grid, households, N, cfg.groupTolerance);
  const stress = Math.max(0, housingCost - cfg.affordabilityKappa * h.income);
  return (
      cfg.lambdaC * Math.log(C)
    + cfg.lambdaH * Math.log(Math.max(0.01, H))
    + cfg.lambdaA * acc
    + cfg.lambdaN * NQ
    + cfg.lambdaS * SF
    + cfg.lambdaG * GF
    - cfg.lambdaT * T
    - cfg.lambdaF * stress
  );
}

function movingCost(fromIdx: number, toIdx: number, N: number, cfg: Config): number {
  const fr = Math.floor(fromIdx / N), fc = fromIdx % N;
  const tr = Math.floor(toIdx / N),   tc = toIdx % N;
  return cfg.movingCostBase + cfg.movingCostDist * (Math.abs(fr - tr) + Math.abs(fc - tc)) / N;
}

// Affordability: balance-sheet (full) or cash-flow (installment)
function isAffordable(price: number, h: Household, cfg: Config): boolean {
  if (cfg.paymentMode === "full") return h.wealth >= price;
  return installmentPayment(price, cfg.installmentN, cfg.installmentM) <= cfg.affordabilityKappa * h.income;
}

// ─── Household initialization ─────────────────────────────────────────────────
function initHouseholds(grid: Uint8Array, N: number, cfg: Config, rng: () => number): Map<number, Household> {
  const households = new Map<number, Household>();
  const valid: number[] = [];
  for (let i = 0; i < N * N; i++) if (grid[i] === EMPTY) valid.push(i);
  for (let i = valid.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [valid[i], valid[j]] = [valid[j], valid[i]]; }
  const count = Math.min(valid.length, Math.floor(valid.length * cfg.populationDensity));
  for (let k = 0; k < count; k++) {
    const idx = valid[k];
    grid[idx] = RESIDENTIAL;
    const miq = Math.max(0.01, Math.min(0.99, 0.5 + gaussRng(rng) * 0.2));
    const age = Math.floor(rng() * cfg.maxAge);
    const deathAge = Math.max(30, Math.round(cfg.avgDeathAge + gaussRng(rng) * 8));
    households.set(idx, {
      group: Math.floor(rng() * Math.max(1, cfg.numGroups)),
      moneyIq: miq, age, deathAge,
      income: cfg.baseIncome * miq,
      wealth: Math.max(0, gaussRng(rng) * 30 + 50),
      savingPropensity: 0.1 + rng() * 0.3,
      utility: 0, satisfaction: 0.5, groupFit: 0,
      loanRemaining: 0, loanPayment: 0,
    });
  }
  return households;
}

// ─── Simulation tick ──────────────────────────────────────────────────────────
function simulationTick(
  grid: Uint8Array,
  households: Map<number, Household>,
  N: number,
  cfg: Config,
  maps: AccessMaps,
  rng: () => number,
  demandMap: Float32Array
): { deaths: number; moves: number } {
  let deaths = 0, moves = 0;

  // Phase 1: Demand decay
  for (let i = 0; i < demandMap.length; i++) demandMap[i] *= cfg.demandDecay;

  // Phase 2: Age + death / inheritance
  for (const [, h] of households) {
    h.age++;
    if (h.age >= h.deathAge) {
      deaths++;
      h.group = Math.floor(rng() * Math.max(1, cfg.numGroups));
      h.moneyIq = Math.max(0.01, Math.min(0.99,
        cfg.moneyIqPersistence * h.moneyIq + (1 - cfg.moneyIqPersistence) * (0.5 + gaussRng(rng) * 0.2)));
      h.wealth = cfg.inheritanceRetention * Math.max(0, h.wealth);
      h.age = 0;
      h.deathAge = Math.max(30, Math.round(cfg.avgDeathAge + gaussRng(rng) * 8));
      h.savingPropensity = 0.1 + rng() * 0.3;
      h.loanRemaining = 0;
      h.loanPayment = 0;
    }
  }

  // Phase 3: Income, wealth, utility update
  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    h.income = computeIncome(h, acc, cfg, gaussRng(rng) * (cfg.baseIncome * 0.05));

    const popDen = localPopDensity(idx, grid, N);
    const price  = computePrice(acc, popDen, cfg, demandMap[idx]);

    // Per-step housing cost: loan payment if active, else maintenance
    const housingCost = h.loanRemaining > 0 ? h.loanPayment : price * 0.05;
    h.wealth += h.savingPropensity * h.income - housingCost;
    if (h.loanRemaining > 0) h.loanRemaining--;

    h.satisfaction = computeSocialFit(idx, h, grid, households, N);
    h.groupFit = computeGroupFit(idx, h.group, grid, households, N, cfg.groupTolerance);
    h.utility = computeUtilityAt(idx, h, housingCost, grid, households, N, cfg, maps);
  }

  // Phase 4: Utility-based relocation
  // Build empty-cell list for candidate sampling
  const emptyArr: number[] = [];
  for (let i = 0; i < N * N; i++) if (grid[i] === EMPTY) emptyArr.push(i);
  if (emptyArr.length === 0) return { deaths, moves };

  // Evaluate best feasible candidate for each household; collect demand signals
  type MoveCandidate = { from: number; h: Household; to: number; gain: number };
  const moveQueue: MoveCandidate[] = [];
  const pendingDemand = new Float32Array(N * N);

  for (const [fromIdx, h] of households) {
    const U_stay = h.utility;
    const sampleSize = Math.min(25, emptyArr.length);
    let bestUtil = -Infinity, bestTarget = -1;

    for (let s = 0; s < sampleSize; s++) {
      const cand = emptyArr[Math.floor(rng() * emptyArr.length)];
      const candAcc    = accessibility(cand, maps, N);
      const candPopDen = localPopDensity(cand, grid, N);
      const candPrice  = computePrice(candAcc, candPopDen, cfg, demandMap[cand]);

      if (!isAffordable(candPrice, h, cfg)) continue;

      // Per-step cost at candidate location
      const candHousingCost = cfg.paymentMode === "full"
        ? candPrice * 0.05  // maintenance only after outright purchase
        : installmentPayment(candPrice, cfg.installmentN, cfg.installmentM);

      // Temporarily occupy cell to compute social fit at candidate
      grid[cand] = RESIDENTIAL;
      const U_cand = computeUtilityAt(cand, h, candHousingCost, grid, households, N, cfg, maps);
      grid[cand] = EMPTY;

      const U_net = U_cand - movingCost(fromIdx, cand, N, cfg);
      if (U_net > bestUtil) { bestUtil = U_net; bestTarget = cand; }
    }

    if (bestTarget !== -1) {
      pendingDemand[bestTarget] += 1;
      if (bestUtil > U_stay + cfg.utilityThreshold) {
        moveQueue.push({ from: fromIdx, h, to: bestTarget, gain: bestUtil - U_stay });
      }
    }
  }

  // Update demand map from pending signals
  let maxPD = 1;
  for (let i = 0; i < pendingDemand.length; i++) if (pendingDemand[i] > maxPD) maxPD = pendingDemand[i];
  for (let i = 0; i < N * N; i++) demandMap[i] = Math.min(1, demandMap[i] + pendingDemand[i] / maxPD);

  // Shuffle to avoid ordering bias
  for (let i = moveQueue.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [moveQueue[i], moveQueue[j]] = [moveQueue[j], moveQueue[i]];
  }

  // Execute non-conflicting moves
  const usedFrom = new Set<number>(), usedTo = new Set<number>();
  for (const { from: fromIdx, h, to: targetIdx } of moveQueue) {
    if (usedFrom.has(fromIdx) || usedTo.has(targetIdx)) continue;
    if (grid[targetIdx] !== EMPTY) continue;

    grid[fromIdx] = EMPTY;
    grid[targetIdx] = RESIDENTIAL;
    households.delete(fromIdx);
    households.set(targetIdx, h);

    // Apply payment
    const mAcc    = accessibility(targetIdx, maps, N);
    const mPop    = localPopDensity(targetIdx, grid, N);
    const mPrice  = computePrice(mAcc, mPop, cfg, demandMap[targetIdx]);
    if (cfg.paymentMode === "full") {
      h.wealth -= mPrice;
      h.loanRemaining = 0;
      h.loanPayment = 0;
    } else {
      h.loanRemaining = cfg.installmentN;
      h.loanPayment = installmentPayment(mPrice, cfg.installmentN, cfg.installmentM);
    }

    usedFrom.add(fromIdx);
    usedTo.add(targetIdx);
    moves++;
  }

  return { deaths, moves };
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function getCellColor(
  idx: number, grid: Uint8Array, households: Map<number, Household>,
  cfg: Config, ranges: { maxIncome: number; maxWealth: number; maxUtility: number; minUtility: number }
): [number, number, number] {
  const ct = grid[idx];
  if (ct === RIVER)      return [8, 25, 65];
  if (ct === MOUNTAIN)   return [28, 42, 22];
  if (ct === COMMERCIAL) return [55, 35, 110];
  if (ct === ROAD)       return [58, 52, 46];
  if (ct === BLOCKED)    return [38, 22, 22];
  if (ct === EMPTY)      return [18, 18, 18];
  const h = households.get(idx);
  if (!h) return [18, 18, 18];
  if (cfg.colorMode === "group") {
    return GROUP_COLORS[h.group % GROUP_COLORS.length];
  }
  if (cfg.colorMode === "income") {
    const t = Math.min(1, h.income / Math.max(1, ranges.maxIncome));
    if (t < 0.33) return lerpRGB([10, 20, 70], [0, 180, 180], t / 0.33);
    if (t < 0.67) return lerpRGB([0, 180, 180], [220, 200, 0], (t - 0.33) / 0.34);
    return lerpRGB([220, 200, 0], [220, 40, 20], (t - 0.67) / 0.33);
  }
  if (cfg.colorMode === "wealth") {
    const t = Math.max(0, Math.min(1, (h.wealth + 50) / Math.max(1, ranges.maxWealth + 50)));
    return lerpRGB([50, 10, 90], [220, 170, 30], t);
  }
  if (cfg.colorMode === "age") {
    const t = h.age / Math.max(1, cfg.maxAge);
    if (t < 0.5) return lerpRGB([20, 160, 60], [200, 190, 20], t / 0.5);
    return lerpRGB([200, 190, 20], [200, 30, 20], (t - 0.5) / 0.5);
  }
  // utility mode
  const range = Math.max(0.01, ranges.maxUtility - ranges.minUtility);
  const t = Math.max(0, Math.min(1, (h.utility - ranges.minUtility) / range));
  if (t < 0.5) return lerpRGB([30, 10, 80], [20, 130, 200], t / 0.5);
  return lerpRGB([20, 130, 200], [30, 220, 100], (t - 0.5) / 0.5);
}

// ─── Spatial segregation ──────────────────────────────────────────────────────
function computeSpatialSegregation(grid: Uint8Array, households: Map<number, Household>, N: number): number {
  if (households.size < 3) return 0;
  const sorted = Array.from(households.values()).map(h => h.income).sort((a, b) => a - b);
  const t1 = sorted[Math.floor(sorted.length / 3)];
  const t2 = sorted[Math.floor(2 * sorted.length / 3)];
  const tercile = (inc: number) => inc <= t1 ? 0 : inc <= t2 ? 1 : 2;
  let totalFrac = 0, count = 0;
  for (const [idx, h] of households) {
    const myT = tercile(h.income);
    const r = Math.floor(idx / N), c = idx % N;
    let same = 0, occ = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) {
        occ++;
        const nh = households.get(ni);
        if (nh && tercile(nh.income) === myT) same++;
      }
    }
    if (occ > 0) { totalFrac += same / occ; count++; }
  }
  return count > 0 ? totalFrac / count : 0;
}

// ─── Schelling group segregation ─────────────────────────────────────────────
// Returns mean same-group neighbour share E_same = (1/H) Σ_h s_h(x_h)
function computeGroupSegregation(grid: Uint8Array, households: Map<number, Household>, N: number): { avgSameGroup: number; groupSeg: number } {
  let totalSame = 0, count = 0;
  for (const [idx, h] of households) {
    const r = Math.floor(idx / N), c = idx % N;
    let same = 0, occ = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) {
        occ++;
        const nh = households.get(ni);
        if (nh && nh.group === h.group) same++;
      }
    }
    if (occ > 0) { totalSame += same / occ; count++; }
  }
  const avg = count > 0 ? totalSame / count : 0.5;
  return { avgSameGroup: avg, groupSeg: avg };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function computeMetrics(
  grid: Uint8Array, households: Map<number, Household>, N: number,
  cfg: Config, maps: AccessMaps, prev: Metrics,
  deaths: number, moves: number, demandMap: Float32Array
): { metrics: Metrics; ranges: { maxIncome: number; maxWealth: number; maxUtility: number; minUtility: number } } {
  let sumIncome = 0, sumWealth = 0, sumAge = 0, sumPrice = 0, sumAcc = 0;
  let sumUtility = 0, sumConsumption = 0, sumHousingPayment = 0, countAffordable = 0;
  let sumDistCom = 0, sumDistRoad = 0;
  let maxIncome = 1, maxWealth = 1, maxUtility = -Infinity, minUtility = Infinity;
  const incomes: number[] = [];

  for (const [idx, h] of households) {
    const acc    = accessibility(idx, maps, N);
    const popDen = localPopDensity(idx, grid, N);
    const price  = computePrice(acc, popDen, cfg, demandMap[idx]);
    const housingCost = h.loanRemaining > 0 ? h.loanPayment : price * 0.05;
    const dCom = maps.distToCommercial[idx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const commuteCost = cfg.commuteCostFactor * T * h.income;
    const C = Math.max(0, h.income - housingCost - commuteCost - cfg.basicCost);

    sumIncome       += h.income;
    sumWealth       += h.wealth;
    sumAge          += h.age;
    sumPrice        += price;
    sumAcc          += acc;
    sumUtility      += h.utility;
    sumConsumption  += C;
    sumHousingPayment += housingCost;
    if (isAffordable(price, h, cfg)) countAffordable++;
    sumDistCom  += isFinite(dCom) ? dCom : N;
    sumDistRoad += isFinite(maps.distToRoad[idx]) ? maps.distToRoad[idx] : N;
    incomes.push(h.income);
    if (h.income  > maxIncome)  maxIncome  = h.income;
    if (h.wealth  > maxWealth)  maxWealth  = h.wealth;
    if (h.utility > maxUtility) maxUtility = h.utility;
    if (h.utility < minUtility) minUtility = h.utility;
  }

  const n = Math.max(1, households.size);
  const avgIncome        = sumIncome / n;
  const avgWealth        = sumWealth / n;
  const avgAge           = sumAge / n;
  const avgLocalPrice    = sumPrice / n;
  const avgAccessibility = sumAcc / n;
  const avgUtility       = sumUtility / n;
  const avgConsumption   = sumConsumption / n;
  const avgHousingPayment = sumHousingPayment / n;
  const pctAffordable    = (countAffordable / n) * 100;
  const pctMoved         = (moves / n) * 100;
  const avgDistCommercial = sumDistCom / n;
  const avgDistRoad       = sumDistRoad / n;

  incomes.sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < incomes.length; i++) giniNum += (2 * (i + 1) - incomes.length - 1) * incomes[i];
  const incomeInequalityGini = incomes.length > 1
    ? giniNum / (incomes.length * incomes.length * (avgIncome || 1)) : 0;

  const spatialSegregation = computeSpatialSegregation(grid, households, N);
  const { avgSameGroup, groupSeg } = computeGroupSegregation(grid, households, N);
  const totalDeaths = prev.totalDeaths + deaths;

  const push = (arr: number[], val: number) => {
    const next = [...arr, val];
    return next.length > MAX_HIST ? next.slice(next.length - MAX_HIST) : next;
  };

  return {
    metrics: {
      step: prev.step + 1,
      avgIncome, avgWealth, avgAge, avgLocalPrice, avgAccessibility,
      avgUtility, avgConsumption, avgHousingPayment, pctAffordable,
      movesThisStep: moves, deathsThisStep: deaths, totalDeaths,
      incomeInequalityGini, spatialSegregation,
      avgDistCommercial, avgDistRoad, householdCount: households.size,
      avgSameGroupExposure: avgSameGroup,
      groupSegIndex: groupSeg,
      avgIncomeHistory:         push(prev.avgIncomeHistory,       avgIncome),
      avgWealthHistory:         push(prev.avgWealthHistory,       avgWealth),
      avgAgeHistory:            push(prev.avgAgeHistory,          avgAge),
      avgUtilityHistory:        push(prev.avgUtilityHistory,      avgUtility),
      avgConsumptionHistory:    push(prev.avgConsumptionHistory,  avgConsumption),
      pctMoveHistory:           push(prev.pctMoveHistory,         pctMoved),
      incomeInequalityHistory:  push(prev.incomeInequalityHistory, incomeInequalityGini * 100),
      spatialSegHistory:        push(prev.spatialSegHistory,      spatialSegregation * 100),
      avgPriceHistory:          push(prev.avgPriceHistory,        avgLocalPrice),
      deathsHistory:            push(prev.deathsHistory,          deaths),
      accessibilityHistory:     push(prev.accessibilityHistory,   avgAccessibility * 100),
      avgSameGroupHistory:      push(prev.avgSameGroupHistory,    avgSameGroup * 100),
      groupSegHistory2:         push(prev.groupSegHistory2,       groupSeg * 100),
    },
    ranges: { maxIncome, maxWealth, maxUtility: isFinite(maxUtility) ? maxUtility : 2, minUtility: isFinite(minUtility) ? minUtility : 0 },
  };
}

function emptyMetrics(): Metrics {
  return {
    step: 0, avgIncome: 0, avgWealth: 0, avgAge: 0, avgLocalPrice: 0, avgAccessibility: 0,
    avgUtility: 0, avgConsumption: 0, avgHousingPayment: 0, pctAffordable: 0,
    movesThisStep: 0, deathsThisStep: 0, totalDeaths: 0,
    incomeInequalityGini: 0, spatialSegregation: 0,
    avgDistCommercial: 0, avgDistRoad: 0, householdCount: 0,
    avgSameGroupExposure: 0.5, groupSegIndex: 0.5,
    avgIncomeHistory: [], avgWealthHistory: [], avgAgeHistory: [],
    avgUtilityHistory: [], avgConsumptionHistory: [],
    pctMoveHistory: [], incomeInequalityHistory: [], spatialSegHistory: [],
    avgPriceHistory: [], deathsHistory: [], accessibilityHistory: [],
    avgSameGroupHistory: [], groupSegHistory2: [],
  };
}

// ─── Viz data (distributions + scatter) ──────────────────────────────────────
interface VizData {
  ageDist:     { bin: string; count: number }[];
  incomeDist:  { bin: string; count: number }[];
  utilityDist: { bin: string; count: number }[];
  scatterData: { age: number; income: number; acc: number; utility: number; price: number; consumption: number }[];
}

function emptyVizData(): VizData { return { ageDist: [], incomeDist: [], utilityDist: [], scatterData: [] }; }

function computeVizData(
  grid: Uint8Array, households: Map<number, Household>, N: number, cfg: Config, maps: AccessMaps, demandMap: Float32Array
): VizData {
  const ageArr: number[] = [], incomeArr: number[] = [], utilityArr: number[] = [];
  const scatter: VizData["scatterData"] = [];
  let i = 0;
  for (const [idx, h] of households) {
    const acc    = accessibility(idx, maps, N);
    const popDen = localPopDensity(idx, grid, N);
    const price  = computePrice(acc, popDen, cfg, demandMap[idx]);
    const housingCost = h.loanRemaining > 0 ? h.loanPayment : price * 0.05;
    const dCom = maps.distToCommercial[idx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const consumption = Math.max(0, h.income - housingCost - cfg.commuteCostFactor * T * h.income - cfg.basicCost);
    ageArr.push(h.age);
    incomeArr.push(h.income);
    utilityArr.push(h.utility);
    if (i % 3 === 0 && scatter.length < 400)
      scatter.push({ age: h.age, income: h.income, acc, utility: h.utility, price, consumption });
    i++;
  }
  const makeDist = (arr: number[], bins: number, fmt: (lo: number, hi: number) => string) => {
    const lo = arr.length ? Math.min(...arr) : 0;
    const hi = arr.length ? Math.max(...arr) : 1;
    const range = hi - lo || 1;
    const result = Array.from({ length: bins }, (_, b) => ({ bin: fmt(lo + b * range / bins, lo + (b + 1) * range / bins), count: 0 }));
    for (const v of arr) result[Math.min(bins - 1, Math.floor(((v - lo) / range) * bins))].count++;
    return result;
  };
  return {
    ageDist:     makeDist(ageArr,    20, (lo, hi) => `${Math.round(lo)}-${Math.round(hi)}`),
    incomeDist:  makeDist(incomeArr, 20, (lo, hi) => `${Math.round(lo)}-${Math.round(hi)}`),
    utilityDist: makeDist(utilityArr, 20, (lo, hi) => `${lo.toFixed(2)}-${hi.toFixed(2)}`),
    scatterData: scatter,
  };
}

// ─── Bloomberg KPI block ──────────────────────────────────────────────────────
function KpiBlock({ label, value, sub, color = "#c8c8c8" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-between px-2 py-1.5 bg-[#0d0d0d] border border-[#1c1c1c]" style={{ minWidth: 0 }}>
      <div className="text-[8px] font-medium text-[#555] uppercase tracking-wider truncate">{label}</div>
      <div className="text-[13px] font-mono font-bold leading-tight mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[8px] text-[#3a3a3a] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label: lbl }: {
  active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0a0a] border border-[#222] px-2 py-1.5 text-[9px] font-mono">
      <div className="text-[#555] mb-1">t={lbl}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(3) : p.value}</div>
      ))}
    </div>
  );
}

// ─── Chart strip ──────────────────────────────────────────────────────────────
function ChartStrip({ data, lines, height = 70, label }: {
  data: Record<string, number>[]; lines: { key: string; color: string; name: string }[]; height?: number; label: string;
}) {
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[8px] text-[#444] uppercase tracking-widest px-2 pt-1.5 pb-0.5">{label}</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" />
          <XAxis dataKey="t" tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} width={46} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#333", strokeWidth: 1 }} />
          {lines.map(l => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} dot={false} strokeWidth={1} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Distribution bar chart ───────────────────────────────────────────────────
const DistributionChart = memo(function DistributionChart({ data, label, color }: {
  data: { bin: string; count: number }[]; label: string; color: string;
}) {
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[8px] text-[#444] uppercase tracking-widest px-2 pt-1.5 pb-0.5">{label}</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 10, left: 0, bottom: 22 }} barCategoryGap="4%">
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" vertical={false} />
          <XAxis dataKey="bin" tick={{ fill: "#444", fontSize: 7 }} tickLine={false} axisLine={false} angle={-40} textAnchor="end" interval={3} />
          <YAxis tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip formatter={(v: number) => [v, "agents"]} labelFormatter={(l: string) => `bin: ${l}`}
            contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 9 }} itemStyle={{ color }} cursor={{ fill: "#ffffff08" }} />
          <Bar dataKey="count" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── Scatter plot ─────────────────────────────────────────────────────────────
type AgentPoint = { age: number; income: number; acc: number; utility: number; price: number; consumption: number };
const ScatterPlot = memo(function ScatterPlot({ data, xKey, yKey, xLabel, yLabel, color }: {
  data: AgentPoint[]; xKey: keyof AgentPoint; yKey: keyof AgentPoint; xLabel: string; yLabel: string; color: string;
}) {
  const xVals = data.map(d => d[xKey]);
  const yVals = data.map(d => d[yKey]);
  const xMin = xVals.length ? Math.min(...xVals) : 0;
  const xMax = xVals.length ? Math.max(...xVals) : 1;
  const yMin = yVals.length ? Math.min(...yVals) : 0;
  const yMax = yVals.length ? Math.max(...yVals) : 1;
  const xPad = (xMax - xMin) * 0.05 || 0.5;
  const yPad = (yMax - yMin) * 0.05 || 0.5;
  const xDomain: [number, number] = [+(xMin - xPad).toFixed(2), +(xMax + xPad).toFixed(2)];
  const yDomain: [number, number] = [+(yMin - yPad).toFixed(2), +(yMax + yPad).toFixed(2)];
  const fmt = (v: number) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[8px] text-[#444] uppercase tracking-widest px-2 pt-1.5 pb-0.5">
        {xLabel} <span className="text-[#333]">vs</span> {yLabel}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ScatterChart margin={{ top: 6, right: 14, left: 0, bottom: 18 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" />
          <XAxis dataKey={xKey} type="number" name={xLabel} domain={xDomain} tickCount={5}
            tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={fmt}
            label={{ value: xLabel, position: "insideBottom", fill: "#555", fontSize: 8, offset: -4 }} />
          <YAxis dataKey={yKey} type="number" name={yLabel} domain={yDomain} tickCount={5}
            tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={42} />
          <Tooltip cursor={{ stroke: "#333", strokeWidth: 1 }}
            contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 9 }}
            itemStyle={{ color: "#aaa" }} formatter={(v: number) => v.toFixed(2)} />
          <Scatter data={data} fill={color} opacity={0.35} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function Simulation2() {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics());
  const [vizData, setVizData] = useState<VizData>(emptyVizData());
  const [running, setRunning] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef          = useRef<Uint8Array>(new Uint8Array(0));
  const householdsRef    = useRef<Map<number, Household>>(new Map());
  const accessMapsRef    = useRef<AccessMaps | null>(null);
  const metricsRef       = useRef<Metrics>(emptyMetrics());
  const rangesRef        = useRef<{ maxIncome: number; maxWealth: number; maxUtility: number; minUtility: number }>({ maxIncome: 1, maxWealth: 1, maxUtility: 2, minUtility: 0 });
  const rngRef           = useRef<(() => number)>(makeRng(DEFAULT_CONFIG.seed));
  const runningRef       = useRef(false);
  const rafRef           = useRef<number>(0);
  const lastStepTimeRef  = useRef<number>(0);
  const imageDataRef     = useRef<ImageData | null>(null);
  const displayColorsRef = useRef<Float32Array>(new Float32Array(0));
  const cfgRef           = useRef<Config>(DEFAULT_CONFIG);
  const demandMapRef     = useRef<Float32Array>(new Float32Array(0));

  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // ─── Init / regenerate ────────────────────────────────────────────────────
  const initSim = useCallback((config: Config) => {
    setGenerating(true);
    setTimeout(() => {
      const rng = makeRng(config.seed);
      rngRef.current = rng;
      const { grid } = generateMap(config, rng);
      const households = initHouseholds(grid, config.gridSize, config, rng);
      const maps = buildAccessMaps(grid, config.gridSize);
      const N = config.gridSize;
      const dummyDemand = new Float32Array(N * N);

      // Prime each household with correct income, utility
      for (const [idx, h] of households) {
        const acc  = accessibility(idx, maps, N);
        h.income   = computeIncome(h, acc, config, 0);
        const popDen = localPopDensity(idx, grid, N);
        const price  = computePrice(acc, popDen, config, 0);
        const housingCost = price * 0.05;
        h.satisfaction = computeSocialFit(idx, h, grid, households, N);
        h.utility = computeUtilityAt(idx, h, housingCost, grid, households, N, config, maps);
      }

      gridRef.current       = grid;
      householdsRef.current = households;
      accessMapsRef.current = maps;
      displayColorsRef.current = new Float32Array(N * N * 3).fill(18);
      demandMapRef.current  = dummyDemand;

      const { metrics: initM, ranges: initR } = computeMetrics(grid, households, N, config, maps, emptyMetrics(), 0, 0, dummyDemand);
      initM.step = 0;
      metricsRef.current = initM;
      rangesRef.current  = initR;
      setMetrics({ ...initM });
      setVizData(computeVizData(grid, households, N, config, maps, dummyDemand));
      setGenerating(false);
    }, 10);
  }, []);

  useEffect(() => { initSim(DEFAULT_CONFIG); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Canvas render ────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const N = cfgRef.current.gridSize;
    const grid = gridRef.current;
    if (grid.length !== N * N) return;
    if (!imageDataRef.current || imageDataRef.current.width !== CANVAS_SIZE)
      imageDataRef.current = new ImageData(CANVAS_SIZE, CANVAS_SIZE);
    if (displayColorsRef.current.length !== N * N * 3)
      displayColorsRef.current = new Float32Array(N * N * 3).fill(18);
    const dc = displayColorsRef.current;
    for (let idx = 0; idx < N * N; idx++) {
      const [tr, tg, tb] = getCellColor(idx, grid, householdsRef.current, cfgRef.current, rangesRef.current);
      const base = idx * 3;
      dc[base]   += (tr - dc[base])   * LERP_FACTOR;
      dc[base+1] += (tg - dc[base+1]) * LERP_FACTOR;
      dc[base+2] += (tb - dc[base+2]) * LERP_FACTOR;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const cs = CANVAS_SIZE / N;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const idx = r * N + c, base = idx * 3;
      ctx.fillStyle = `rgb(${Math.round(dc[base])},${Math.round(dc[base+1])},${Math.round(dc[base+2])})`;
      ctx.fillRect(c * cs, r * cs, cs, cs);
    }
  }, []);

  // ─── Tick ─────────────────────────────────────────────────────────────────
  const tick = useCallback((timestamp: number) => {
    if (!runningRef.current) return;
    const config = cfgRef.current;
    if (timestamp - lastStepTimeRef.current >= config.speed) {
      lastStepTimeRef.current = timestamp;
      const grid = gridRef.current, households = householdsRef.current, maps = accessMapsRef.current, N = config.gridSize;
      if (grid.length === N * N && maps) {
        const { deaths, moves } = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
        const { metrics: newM, ranges } = computeMetrics(grid, households, N, config, maps, metricsRef.current, deaths, moves, demandMapRef.current);
        metricsRef.current = newM;
        rangesRef.current  = ranges;
        setMetrics({ ...newM });
        if (newM.step % 5 === 0) setVizData(computeVizData(grid, households, N, config, maps, demandMapRef.current));
        if (newM.step >= config.maxSteps) { runningRef.current = false; setRunning(false); return; }
      }
    }
    renderCanvas();
    rafRef.current = requestAnimationFrame(tick);
  }, [renderCanvas]);

  useEffect(() => {
    if (running) {
      runningRef.current = true;
      lastStepTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } else {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    }
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [running, tick]);

  useEffect(() => {
    if (!running) { const id = requestAnimationFrame(() => renderCanvas()); return () => cancelAnimationFrame(id); }
  }, [running, renderCanvas, metrics]);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const handleStart = () => setRunning(true);
  const handlePause = () => setRunning(false);
  const handleReset = () => { setRunning(false); runningRef.current = false; cancelAnimationFrame(rafRef.current); initSim(cfgRef.current); };
  const handleStep  = () => {
    if (running) return;
    const config = cfgRef.current, grid = gridRef.current, households = householdsRef.current, maps = accessMapsRef.current, N = config.gridSize;
    if (grid.length === N * N && maps) {
      const { deaths, moves } = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
      const { metrics: newM, ranges } = computeMetrics(grid, households, N, config, maps, metricsRef.current, deaths, moves, demandMapRef.current);
      metricsRef.current = newM; rangesRef.current = ranges;
      setMetrics({ ...newM });
      setVizData(computeVizData(grid, households, N, config, maps, demandMapRef.current));
      renderCanvas();
    }
  };

  const updateCfg = <K extends keyof Config>(key: K, value: Config[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }));
    cfgRef.current = { ...cfgRef.current, [key]: value };
  };

  // ─── Slider component ──────────────────────────────────────────────────────
  const Slider = ({ label, k, min, max, step = 1, decimals = 0 }: {
    label: string; k: keyof Config; min: number; max: number; step?: number; decimals?: number;
  }) => {
    const val = cfg[k] as number;
    const id = `sl-${k}`;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <label htmlFor={id} className="text-[10px] text-[#888]">{label}</label>
          <span className="text-[10px] text-[#aaa] font-mono">{val.toFixed(decimals)}</span>
        </div>
        <input id={id} type="range" min={min} max={max} step={step} value={val}
          onChange={e => updateCfg(k, parseFloat(e.target.value) as Config[typeof k])}
          className="w-full h-1 accent-[#4466aa] cursor-pointer" />
      </div>
    );
  };

  // ─── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const len = metrics.avgIncomeHistory.length;
    return Array.from({ length: len }, (_, i) => ({
      t:       i,
      income:  +metrics.avgIncomeHistory[i].toFixed(2),
      wealth:  +metrics.avgWealthHistory[i].toFixed(2),
      price:   +metrics.avgPriceHistory[i].toFixed(2),
      utility: +metrics.avgUtilityHistory[i].toFixed(3),
      cons:    +metrics.avgConsumptionHistory[i].toFixed(2),
      ineq:    +metrics.incomeInequalityHistory[i].toFixed(4),
      seg:     +metrics.spatialSegHistory[i].toFixed(4),
      pctMove: +metrics.pctMoveHistory[i].toFixed(2),
      access:  +metrics.accessibilityHistory[i].toFixed(4),
      age:         +metrics.avgAgeHistory[i].toFixed(2),
      deaths:      +metrics.deathsHistory[i].toFixed(0),
      sameGroup:   +(metrics.avgSameGroupHistory[i] ?? 0).toFixed(2),
      groupSeg:    +(metrics.groupSegHistory2[i] ?? 0).toFixed(2),
    }));
  }, [metrics]);

  const m = metrics;

  // ─── Math panel equations ──────────────────────────────────────────────────
  const mathEquations: { title: string; sym: string; num?: string; note: string }[] = [
    {
      title: "Full payment",
      sym: String.raw`Pay_h^{\text{full}}(x)=P(x)`,
      note: "Household pays full market price immediately. Feasibility: W_h ≥ P(x).",
    },
    {
      title: "Installment payment (per step)",
      sym: String.raw`Pay_h^{\text{inst}}(x;N,m)=\begin{cases}\dfrac{P(x)}{N},&m=0\\[6pt]P(x)\cdot\dfrac{m(1+m)^N}{(1+m)^N-1},&m>0\end{cases}`,
      num: cfg.paymentMode === "installment"
        ? String.raw`=P(x)\cdot\frac{${cfg.installmentM.toFixed(3)}(1+${cfg.installmentM.toFixed(3)})^{${cfg.installmentN}}}{(1+${cfg.installmentM.toFixed(3)})^{${cfg.installmentN}}-1}`
        : undefined,
      note: `Feasibility: Pay_inst ≤ κ·Y_h. Current: N=${cfg.installmentN} steps, m=${cfg.installmentM.toFixed(3)}/step.`,
    },
    {
      title: "Market price index",
      sym: String.raw`P(x)=P_0+\beta_A A(x)+\beta_D\,\rho_{\mathrm{pop}}(x)+\beta_{\mathrm{dem}}\,d(x)`,
      num: `=${cfg.basePrice}+${cfg.accessibilityPriceEffect}\\,A(x)+${cfg.densityPriceEffect}\\,\\rho_{\\mathrm{pop}}+${cfg.demandPriceEffect}\\,d(x)`,
      note: "Demand d(x) accumulates from feasible households preferring this cell; decays each step.",
    },
    {
      title: "Disposable consumption",
      sym: String.raw`C_h(x)=Y_h-Pay_h(x)-\gamma_T\cdot T(x)\cdot Y_h-\text{BasicCost}`,
      note: "Residual income after housing payment, commuting cost, and fixed living expenses.",
    },
    {
      title: "Housing service (static terrain proxy)",
      sym: String.raw`H(x)=1+2\cdot\text{Green}(x)+0.3\cdot\text{RiverNear}(x)`,
      note: "Precomputed from terrain: mountain proximity = greenery/quiet; moderate river proximity is pleasant.",
    },
    {
      title: "Neighborhood quality",
      sym: String.raw`NQ(x)=0.5\,\mathrm{Green}(x)+0.3\,\mathrm{RiverAmen}(x)-0.6\,\mathrm{Blocked}(x)`,
      note: "Static amenity score: green areas and river amenity are positive; blocked zones are a disamenity.",
    },
    {
      title: "Schelling group identity",
      sym: String.raw`g_h \in \{0,1,\dots,G-1\},\quad \Pr(g_h=k)=\tfrac{1}{G}`,
      num: `G=${cfg.numGroups}`,
      note: "Each household belongs to exactly one group. Groups are assigned uniformly at birth and re-randomised at death.",
    },
    {
      title: "Same-group neighbourhood share",
      sym: String.raw`s_h(x)=\begin{cases}\dfrac{\#\{j\in\mathcal{N}(x): g_j=g_h\}}{\#\mathcal{N}_{\mathrm{occ}}(x)}, & |\mathcal{N}_{\mathrm{occ}}(x)|>0\\[6pt]0.5, & |\mathcal{N}_{\mathrm{occ}}(x)|=0\end{cases}`,
      note: "Fraction of occupied neighbours (5×5 window) that share household h's group identity.",
    },
    {
      title: "Schelling group-fit term",
      sym: String.raw`\Gamma_h(x)=s_h(x)-\tau_G`,
      num: `\\tau_G=${cfg.groupTolerance.toFixed(2)}`,
      note: "Positive when same-group share exceeds tolerance threshold; negative when neighbourhood is too dissimilar. Range: [−τ_G, 1−τ_G].",
    },
    {
      title: "Utility function (with group composition)",
      sym: String.raw`U_h(x)=\lambda_C\ln\!\bigl(\max(\varepsilon,C_h(x))\bigr)+\lambda_H\ln\!(H(x))+\lambda_A A(x)+\lambda_N NQ(x)+\lambda_S Q_h(x)+\lambda_G\Gamma_h(x)-\lambda_T T(x)-\lambda_F\max(0,Pay_h-\kappa Y_h)`,
      num: `\\lambda_C=${cfg.lambdaC.toFixed(2)},\\;\\lambda_H=${cfg.lambdaH.toFixed(2)},\\;\\lambda_A=${cfg.lambdaA.toFixed(2)},\\;\\lambda_N=${cfg.lambdaN.toFixed(2)},\\;\\lambda_S=${cfg.lambdaS.toFixed(2)},\\;\\lambda_G=${cfg.lambdaG.toFixed(2)},\\;\\lambda_T=${cfg.lambdaT.toFixed(2)},\\;\\lambda_F=${cfg.lambdaF.toFixed(2)}`,
      note: "Schelling term λ_G·Γ_h(x) makes households prefer locations where same-group share exceeds τ_G, embedding segregation pressure into welfare-maximising mobility.",
    },
    {
      title: "Demand update (feasible households wanting this cell)",
      sym: String.raw`\mathrm{Demand}(x)=\textstyle\sum_h\mathbf{1}[\mathrm{Feasible}_h(x)]\cdot\mathbf{1}[U_h(x)-MC_h(x)>U_h^{\mathrm{stay}}+\tau_U]`,
      note: "Hot cells attract many feasible welfare-improving moves, driving up their price next period.",
    },
    {
      title: "Moving cost",
      sym: String.raw`MC_h(x)=\mu_0+\mu_1\cdot\frac{\|x-x_h^{\mathrm{cur}}\|_1}{N}`,
      num: `=\\;${cfg.movingCostBase.toFixed(2)}+${cfg.movingCostDist.toFixed(2)}\\cdot\\frac{\\mathrm{dist}}{N}`,
      note: "Utility cost of relocating, rising with distance. Households may rationally stay when nearby gains are small.",
    },
    {
      title: "Stay vs. move decision",
      sym: String.raw`x_h^\star=\arg\max_{x\in\mathcal{F}_h}\bigl(U_h(x)-MC_h(x)\bigr),\quad\text{move iff }U_h(x_h^\star)-MC_h(x_h^\star)>U_h^{\mathrm{stay}}+\tau_U`,
      num: `\\tau_U=${cfg.utilityThreshold.toFixed(3)}`,
      note: "Staying is an active welfare-preserving choice, not failure to move.",
    },
    {
      title: "Wealth update",
      sym: String.raw`W_h(t+1)=W_h(t)+s_h Y_h(t)-Pay_h(t)`,
      note: "Saving propensity s_h ∈ [0.1, 0.4]. For full purchase: wealth drops by P at move time, then only maintenance. For installment: N steps of payments.",
    },
    {
      title: "Wealth inheritance",
      sym: String.raw`W_h^{\mathrm{new}}=\rho_W W_h^{\mathrm{old}},\quad M_h^{\mathrm{new}}=\eta M_h^{\mathrm{old}}+(1-\eta)\,\varepsilon_h`,
      num: `\\rho_W=${cfg.inheritanceRetention.toFixed(2)},\\;\\eta=${cfg.moneyIqPersistence.toFixed(2)}`,
      note: "Fraction of wealth and MoneyIQ persistence passed to next generation at household death.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-[#d4d4d4] font-sans p-4 pb-16">

      {/* Header */}
      <div className="mb-4">
        <div className="text-[11px] text-[#555] mb-1">
          <Link href="/projectx" className="hover:text-[#888] transition-colors">Project X</Link>
          <span className="mx-1">/</span>
          <span className="text-[#777]">Simulation 2</span>
        </div>
        <h1 className="text-xl font-bold text-[#e8e8e8] tracking-tight mb-1">
          Extended Schelling Urban Simulation
        </h1>
        <p className="text-[12px] text-[#666] max-w-3xl leading-relaxed">
          Utility-maximising residential choice model: households compare welfare across locations, subject to
          affordability and financing constraints. Demand is endogenous — feasible households wanting a cell
          raise its price. Staying is an active choice.
        </p>

        {/* Math model panel */}
        <div className="mt-3 border border-[#222] rounded">
          <button type="button" onClick={() => setMathOpen(o => !o)}
            className="w-full text-left px-3 py-2 text-[11px] text-[#777] hover:text-[#bbb] flex justify-between items-center transition-colors"
            aria-expanded={mathOpen ? "true" : "false"}>
            <span className="font-medium">Mathematical Model — Utility-Based Residential Choice</span>
            <span className="text-[#555] text-[10px]">{mathOpen ? "collapse ▲" : "expand ▼"}</span>
          </button>
          {mathOpen && (
            <div className="px-4 pb-4 border-t border-[#1e1e1e] overflow-y-auto max-h-[70vh]">
              {mathEquations.map(({ title, sym, num, note }) => (
                <div key={title} className="mt-3 first:mt-2">
                  <div className="text-[10px] font-medium text-[#888] uppercase tracking-wider mb-1">{title}</div>
                  <div className="overflow-x-auto py-1 px-2 bg-[#0d0d0d] rounded border border-[#1e1e1e] text-[#ccc]"
                    dangerouslySetInnerHTML={{ __html: katex.renderToString(sym, { throwOnError: false, displayMode: true }) }} />
                  {num && (
                    <div className="overflow-x-auto py-1 px-2 mt-px bg-[#0a0a0a] rounded border border-[#1a1a1a] text-[#7a9a6a]"
                      dangerouslySetInnerHTML={{ __html: katex.renderToString(num, { throwOnError: false, displayMode: true }) }} />
                  )}
                  <div className="text-[10px] text-[#555] mt-1 leading-relaxed">{note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main row */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: `${CANVAS_SIZE}px 1fr` }}>

        {/* Canvas + legend */}
        <div className="flex flex-col gap-2">
          <div className="border border-[#1c1c1c] rounded overflow-hidden relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} />
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#080808aa] text-[#666] text-sm">Generating map…</div>
            )}
          </div>
          <div className="border border-[#1c1c1c] rounded px-3 py-2">
            <div className="text-[9px] text-[#555] uppercase mb-1.5">Legend</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { color: "rgb(18,18,18)",   label: "Empty" },
                { color: "rgb(55,35,110)",  label: "Commercial" },
                { color: "rgb(58,52,46)",   label: "Road" },
                { color: "rgb(8,25,65)",    label: "River" },
                { color: "rgb(28,42,22)",   label: "Mountain" },
                { color: "rgb(38,22,22)",   label: "Blocked" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm border border-[#333]" style={{ backgroundColor: color }} />
                  <span className="text-[9px] text-[#666]">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-[9px] text-[#555]">Residential cells colored by selected mode</div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-3 min-w-0">

          {/* KPI rows */}
          <div className="grid grid-cols-4 gap-px bg-[#161616]">
            <KpiBlock label="Step"          value={m.step.toLocaleString()}                        color="#e0e0e0" />
            <KpiBlock label="Agents"        value={m.householdCount.toLocaleString()}               color="#aaaaaa" />
            <KpiBlock label="Avg Income"    value={m.avgIncome.toFixed(1)}                         color="#22cccc" />
            <KpiBlock label="Avg Wealth"    value={m.avgWealth.toFixed(1)}                         color="#aa88ee" />
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#161616] mt-px">
            <KpiBlock label="Avg Utility"   value={m.avgUtility.toFixed(3)}                        color="#30dd88" sub="U_h(x)" />
            <KpiBlock label="Avg Consump."  value={m.avgConsumption.toFixed(1)}                    color="#44bbcc" sub="C_h(x)" />
            <KpiBlock label="Avg Housing"   value={m.avgHousingPayment.toFixed(2)}                 color="#dd8800" sub="per step" />
            <KpiBlock label="Avg Price"     value={m.avgLocalPrice.toFixed(1)}                     color="#cc6600" sub="P(x)" />
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#161616] mt-px">
            <KpiBlock label="Moved/step"    value={m.movesThisStep.toLocaleString()}               color={m.movesThisStep > 50 ? "#ee6633" : "#888"} sub="utility-driven" />
            <KpiBlock label="Deaths"        value={m.totalDeaths.toLocaleString()}                 color="#666" sub={`+${m.deathsThisStep}/step`} />
            <KpiBlock label="Gini"          value={m.incomeInequalityGini.toFixed(3)}              color={m.incomeInequalityGini > 0.4 ? "#cc2222" : "#999"} sub="income ineq." />
            <KpiBlock label="Spatial Seg."  value={m.spatialSegregation.toFixed(3)}               color={m.spatialSegregation > 0.6 ? "#cc2222" : m.spatialSegregation > 0.4 ? "#cc8800" : "#999"} sub="same-band nbrs" />
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#161616] mt-px">
            <KpiBlock label="Affordable %"  value={m.pctAffordable.toFixed(1) + "%"}              color={m.pctAffordable < 50 ? "#cc2222" : "#55cc77"} sub={cfg.paymentMode} />
            <KpiBlock label="Access ×100"   value={(m.avgAccessibility * 100).toFixed(1)}         color="#5577cc" />
            <KpiBlock label="Dist Comm."    value={m.avgDistCommercial.toFixed(1)}                color="#555" sub="wtd cells" />
            <KpiBlock label="Avg Age"       value={m.avgAge.toFixed(1)}                           color={m.avgAge > 60 ? "#cc4422" : "#44bb77"} />
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#161616] mt-px">
            <KpiBlock label="Groups G"      value={cfg.numGroups.toString()}                      color="#cc88ff" sub="Schelling" />
            <KpiBlock label="Same-grp exp." value={(m.avgSameGroupExposure * 100).toFixed(1) + "%"} color={m.avgSameGroupExposure > 0.7 ? "#cc4444" : m.avgSameGroupExposure > 0.55 ? "#cc8800" : "#88aadd"} sub="E_same" />
            <KpiBlock label="Group seg."    value={(m.groupSegIndex * 100).toFixed(1) + "%"}      color={m.groupSegIndex > 0.7 ? "#cc4444" : m.groupSegIndex > 0.55 ? "#cc8800" : "#88aadd"} sub="avg nbr share" />
            <KpiBlock label="Tolerance τ_G" value={cfg.groupTolerance.toFixed(2)}                 color="#9966cc" sub="threshold" />
          </div>

          {/* Charts */}
          <div className="flex flex-col gap-px mt-px">
            <ChartStrip label="Income · Wealth · Price" data={chartData} height={120}
              lines={[{ key: "income", color: "#22cccc", name: "Income" }, { key: "wealth", color: "#aa88ee", name: "Wealth" }, { key: "price", color: "#dd8800", name: "Price" }]} />
            <ChartStrip label="Avg Utility · Avg Consumption" data={chartData} height={110}
              lines={[{ key: "utility", color: "#30dd88", name: "Utility" }, { key: "cons", color: "#44bbcc", name: "Consump." }]} />
            <ChartStrip label="Gini · Spatial Segregation" data={chartData} height={110}
              lines={[{ key: "ineq", color: "#cc4444", name: "Gini" }, { key: "seg", color: "#cc8800", name: "Seg." }]} />
            <ChartStrip label="% Moved · Accessibility ×100" data={chartData} height={110}
              lines={[{ key: "pctMove", color: "#ee6633", name: "Move%" }, { key: "access", color: "#5577cc", name: "Access" }]} />
            <ChartStrip label="Avg Age · Deaths / Step" data={chartData} height={110}
              lines={[{ key: "age", color: "#44bb77", name: "Age" }, { key: "deaths", color: "#666666", name: "Deaths" }]} />
            <ChartStrip label="Schelling: Same-group Exposure × 100 · Group Segregation × 100" data={chartData} height={110}
              lines={[{ key: "sameGroup", color: "#cc88ff", name: "E_same×100" }, { key: "groupSeg", color: "#9944cc", name: "GroupSeg×100" }]} />
          </div>
        </div>
      </div>

      {/* Distribution charts */}
      <div className="mt-3 grid grid-cols-3 gap-px bg-[#161616]">
        <DistributionChart data={vizData.ageDist}     label="Age distribution (snapshot)"     color="#44bb77" />
        <DistributionChart data={vizData.incomeDist}  label="Income distribution (snapshot)"   color="#22cccc" />
        <DistributionChart data={vizData.utilityDist} label="Utility distribution (snapshot)"  color="#30dd88" />
      </div>

      {/* Scatter plots */}
      <div className="mt-px grid grid-cols-2 gap-px bg-[#161616]">
        <ScatterPlot data={vizData.scatterData} xKey="age"    yKey="income"      xLabel="Age"         yLabel="Income"      color="#22cccc" />
        <ScatterPlot data={vizData.scatterData} xKey="acc"    yKey="utility"     xLabel="Accessibility" yLabel="Utility"   color="#30dd88" />
        <ScatterPlot data={vizData.scatterData} xKey="income" yKey="consumption" xLabel="Income"      yLabel="Consumption"  color="#44bbcc" />
        <ScatterPlot data={vizData.scatterData} xKey="age"    yKey="price"       xLabel="Age"         yLabel="Price"        color="#dd8800" />
      </div>

      {/* Controls */}
      <div className="mt-4 border border-[#1a1a1a] rounded p-3">

        {/* Button row */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button type="button" onClick={handleStart} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a3a1a] border border-[#2a5a2a] text-[#66cc66] hover:bg-[#223a22] disabled:opacity-40 transition-colors">Start</button>
          <button type="button" onClick={handlePause} disabled={!running}
            className="px-3 py-1.5 text-xs rounded bg-[#3a2a00] border border-[#5a4400] text-[#ccaa00] hover:bg-[#4a3800] disabled:opacity-40 transition-colors">Pause</button>
          <button type="button" onClick={handleReset} disabled={generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:bg-[#222] disabled:opacity-40 transition-colors">Reset</button>
          <button type="button" onClick={handleStep} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#0e1a2e] border border-[#1a2e4a] text-[#4488cc] hover:bg-[#142238] disabled:opacity-40 transition-colors">Step</button>
          <button type="button" onClick={() => { if (!running) initSim(cfgRef.current); }} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a1020] border border-[#2a1a38] text-[#9966cc] hover:bg-[#221430] disabled:opacity-40 transition-colors">Regen Map</button>

          <span className={`ml-2 px-2 py-1 text-[10px] rounded border font-mono ${running ? "bg-[#0e2010] border-[#1a4020] text-[#44bb66]" : generating ? "bg-[#1a1020] border-[#2a1538] text-[#9966cc]" : "bg-[#111] border-[#222] text-[#555]"}`}>
            {running ? "● RUNNING" : generating ? "⟳ GENERATING" : "■ PAUSED"}
          </span>
          <span className="text-[10px] text-[#444] font-mono ml-1">seed:{cfg.seed}</span>

          <div className="ml-auto flex items-center gap-1">
            <span className="text-[9px] text-[#555] mr-1">Color:</span>
            {(["income", "wealth", "age", "utility", "group"] as const).map(mode => (
              <button type="button" key={mode} onClick={() => updateCfg("colorMode", mode)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${cfg.colorMode === mode ? "bg-[#1a2a3a] border-[#2a4a6a] text-[#88aadd]" : "bg-[#111] border-[#1e1e1e] text-[#555] hover:text-[#888]"}`}>
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Payment mode toggle */}
        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-[#1a1a1a]">
          <span className="text-[10px] text-[#555] uppercase tracking-wider">Payment mode:</span>
          {(["installment", "full"] as const).map(mode => (
            <button type="button" key={mode} onClick={() => updateCfg("paymentMode", mode)}
              className={`px-3 py-1 text-[10px] rounded border transition-colors ${cfg.paymentMode === mode ? "bg-[#1a2a1a] border-[#2a4a2a] text-[#66cc88]" : "bg-[#111] border-[#222] text-[#555] hover:text-[#888]"}`}>
              {mode === "installment" ? `Installment (N=${cfg.installmentN}, m=${cfg.installmentM.toFixed(3)})` : "Full purchase"}
            </button>
          ))}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[#1c1c1c]">
          <span className="text-[10px] text-[#555] uppercase tracking-wider w-12 shrink-0">Presets</span>
          {([
            { label: "Balanced", tip: "Mixed terrain, moderate inequality, default utility weights", patch: { riverAmount: 2, mountainAmount: 2, moneyIqEffect: 0.5, accessibilityPriceEffect: 20, utilityThreshold: 0.05, movingCostBase: 0.10 } },
            { label: "High Inequality", tip: "Strong MoneyIQ effect, high access premium, low inheritance", patch: { moneyIqEffect: 1.5, accessibilityIncomeEffect: 0.7, accessibilityPriceEffect: 40, inheritanceRetention: 0.3, moneyIqPersistence: 0.8, lambdaC: 0.5 } },
            { label: "Central Pricing", tip: "Expensive cores, cheap periphery — affordability pressure", patch: { accessibilityPriceEffect: 50, densityPriceEffect: 15, affordabilityKappa: 0.3, paymentMode: "installment" as const, lambdaF: 0.3 } },
            { label: "Barrier-Heavy", tip: "Many rivers and mountains fragment accessibility", patch: { riverAmount: 4, mountainAmount: 4, blockedAmount: 3, roadDensity: 1.8, commercialCount: 4, lambdaT: 0.25 } },
            { label: "Sticky Agents", tip: "High moving costs — households rarely relocate", patch: { movingCostBase: 0.5, movingCostDist: 0.4, utilityThreshold: 0.2 } },
            { label: "Installment+", tip: "Long installment with interest — cash-flow constrained mobility", patch: { paymentMode: "installment" as const, installmentN: 24, installmentM: 0.04, lambdaF: 0.3, affordabilityKappa: 0.3 } },
            { label: "Schelling 4G", tip: "4 groups, strong group preference, low tolerance — classic segregation dynamics", patch: { numGroups: 4, groupTolerance: 0.40, lambdaG: 0.35, lambdaS: 0.05 } },
            { label: "Schelling 2G Hi", tip: "2 groups, high intolerance — rapid polarisation", patch: { numGroups: 2, groupTolerance: 0.55, lambdaG: 0.40, lambdaS: 0.05 } },
          ] as { label: string; tip: string; patch: Partial<Config> }[]).map(({ label, tip, patch }) => (
            <button key={label} type="button" title={tip} disabled={running || generating}
              onClick={() => { const next = { ...cfgRef.current, ...patch }; cfgRef.current = next; setCfg(next); initSim(next); }}
              className="px-2.5 py-1 text-[10px] rounded border border-[#2a2a2a] bg-[#141414] text-[#777] hover:text-[#bbb] hover:border-[#3a3a3a] disabled:opacity-40 transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Sliders — 6 columns */}
        <div className="grid grid-cols-6 gap-x-5 gap-y-0.5">

          {/* Col 1: Geography */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Geography</div>
            <Slider label="Grid size"       k="gridSize"         min={40}  max={100} />
            <Slider label="Rivers"          k="riverAmount"      min={0}   max={4} />
            <Slider label="Mountains"       k="mountainAmount"   min={0}   max={4} />
            <Slider label="Blocked areas"   k="blockedAmount"    min={0}   max={3} />
            <Slider label="Commercial #"    k="commercialCount"  min={1}   max={5} />
            <Slider label="Compactness"     k="commercialCompactness" min={0.3} max={1.0} step={0.05} decimals={2} />
            <Slider label="Road density"    k="roadDensity"      min={0.5} max={2.0} step={0.1} decimals={1} />
            <Slider label="Pop. density"    k="populationDensity" min={0.1} max={0.7} step={0.05} decimals={2} />
          </div>

          {/* Col 2: Economy */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Economy</div>
            <Slider label="Base income Y₀"  k="baseIncome"               min={10}  max={200} />
            <Slider label="MoneyIQ αM"      k="moneyIqEffect"            min={-1}  max={2}    step={0.05} decimals={2} />
            <Slider label="Access. income αA" k="accessibilityIncomeEffect" min={-1} max={1}  step={0.05} decimals={2} />
            <Slider label="Base price P₀"   k="basePrice"                min={1}   max={50} />
            <Slider label="Access. price βA" k="accessibilityPriceEffect" min={-20} max={60} />
            <Slider label="Density price βD" k="densityPriceEffect"       min={0}   max={20} />
            <Slider label="Demand price βDm" k="demandPriceEffect"        min={0}   max={30} />
            <Slider label="Demand decay"    k="demandDecay"              min={0.5} max={1.0} step={0.01} decimals={2} />
            <Slider label="Inherit. ρW"     k="inheritanceRetention"     min={0}   max={1}   step={0.05} decimals={2} />
            <Slider label="MoneyIQ η"       k="moneyIqPersistence"       min={0}   max={1}   step={0.05} decimals={2} />
          </div>

          {/* Col 3: Affordability & Costs */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Financing & Costs</div>
            <Slider label="Installment N"   k="installmentN"         min={2}   max={48} />
            <Slider label="Interest m"      k="installmentM"         min={0}   max={0.10} step={0.005} decimals={3} />
            <Slider label="Afford. κ"       k="affordabilityKappa"   min={0.1} max={1.0} step={0.05}  decimals={2} />
            <Slider label="Basic cost"      k="basicCost"            min={0}   max={20} />
            <Slider label="Commute factor"  k="commuteCostFactor"    min={0}   max={0.5} step={0.01} decimals={2} />
          </div>

          {/* Col 4: Utility weights */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Utility Weights</div>
            <Slider label="λC consumption"  k="lambdaC" min={0} max={1} step={0.05} decimals={2} />
            <Slider label="λH housing svc"  k="lambdaH" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λA accessibility" k="lambdaA" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λN nbhd quality" k="lambdaN" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λS social fit"   k="lambdaS" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λT travel burden" k="lambdaT" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λF fin. stress"  k="lambdaF" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λG group pref."  k="lambdaG" min={0} max={0.5} step={0.05} decimals={2} />
          </div>

          {/* Col 5: Schelling Groups */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Schelling Groups</div>
            <Slider label="Num. groups G"   k="numGroups"       min={1}   max={8}   step={1}    decimals={0} />
            <Slider label="Tolerance τ_G"   k="groupTolerance"  min={0}   max={1.0} step={0.05} decimals={2} />
            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from({ length: cfg.numGroups }, (_, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm border border-[#333]"
                    style={{ backgroundColor: `rgb(${GROUP_COLORS[i % GROUP_COLORS.length].join(",")})` }} />
                  <span className="text-[9px] text-[#555]">G{i}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 6: Mobility & Lifecycle */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Mobility & Lifecycle</div>
            <Slider label="Utility thresh. τ" k="utilityThreshold"  min={0}   max={0.5}  step={0.01} decimals={2} />
            <Slider label="Move cost μ₀"    k="movingCostBase"     min={0}   max={1.0}  step={0.05} decimals={2} />
            <Slider label="Move cost dist μ₁" k="movingCostDist"  min={0}   max={1.0}  step={0.05} decimals={2} />
            <Slider label="Max age A_max"   k="maxAge"             min={60}  max={120} />
            <Slider label="Avg death age D̄" k="avgDeathAge"        min={40}  max={90} />
            <Slider label="Speed (ms/step)" k="speed"              min={50}  max={500} />
            <Slider label="Max steps"       k="maxSteps"           min={100} max={10000} step={100} />
            <Slider label="Seed"            k="seed"               min={0}   max={9999} />
          </div>
        </div>
      </div>
    </div>
  );
}
