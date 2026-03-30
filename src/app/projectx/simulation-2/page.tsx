"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import katex from "katex";
import "katex/dist/katex.min.css";

// ─── Cell type constants ──────────────────────────────────────────────────────
const EMPTY      = 0;
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
  moneyIq: number;
  age: number;
  deathAge: number;
  income: number;
  wealth: number;
  savingPropensity: number;
  movePressure: number;
  satisfaction: number;
}

interface Config {
  gridSize: number;
  riverAmount: number;
  mountainAmount: number;
  blockedAmount: number;
  commercialCount: number;
  commercialCompactness: number;
  roadDensity: number;
  populationDensity: number;
  maxAge: number;
  avgDeathAge: number;
  baseIncome: number;
  moneyIqEffect: number;
  accessibilityIncomeEffect: number;
  basePrice: number;
  accessibilityPriceEffect: number;
  densityPriceEffect: number;
  inheritanceRetention: number;
  moneyIqPersistence: number;
  affordabilityKappa: number;
  accessibilityToleranceEffect: number;
  affordabilityEffect: number;
  socialDissatisfactionEffect: number;
  baseMoveThreshold: number;
  speed: number;
  maxSteps: number;
  seed: number;
  colorMode: "income" | "wealth" | "age" | "movePressure";
  demandPriceEffect: number;
  demandDecay: number;
}

interface AccessMaps {
  distToCommercial: Float32Array;
  distToRoad: Float32Array;
  localCommercialDensity: Float32Array;
}

interface Metrics {
  step: number;
  avgIncome: number;
  avgWealth: number;
  avgAge: number;
  avgLocalPrice: number;
  avgAccessibility: number;
  avgAffordabilityStress: number;
  pctWantingToMove: number;
  deathsThisStep: number;
  totalDeaths: number;
  /** Gini coefficient of household incomes — measures income inequality, not spatial pattern */
  incomeInequalityGini: number;
  /** Average fraction of same-income-tercile neighbors — measures spatial clustering by income */
  spatialSegregation: number;
  avgDistCommercial: number;
  avgDistRoad: number;
  householdCount: number;
  avgIncomeHistory: number[];
  avgWealthHistory: number[];
  avgAgeHistory: number[];
  pctMoveHistory: number[];
  incomeInequalityHistory: number[];
  spatialSegHistory: number[];
  avgPriceHistory: number[];
  deathsHistory: number[];
  accessibilityHistory: number[];
  ageDist: number[];
  incomeDist: number[];
  accessDist: number[];
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
  inheritanceRetention: 0.8,
  moneyIqPersistence: 0.5,
  affordabilityKappa: 0.4,
  accessibilityToleranceEffect: -0.05,
  affordabilityEffect: 0.1,
  socialDissatisfactionEffect: 0.15,
  baseMoveThreshold: 0.35,
  speed: 120,
  maxSteps: 5000,
  seed: 42,
  colorMode: "income",
  demandPriceEffect: 8,
  demandDecay: 0.9,
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

// ─── Gaussian noise ──────────────────────────────────────────────────────────
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

// ─── Binary min-heap for efficient Dijkstra ──────────────────────────────────
class MinHeap {
  private d: Float32Array;
  private id: Int32Array;
  private sz = 0;
  constructor(capacity: number) {
    this.d  = new Float32Array(capacity);
    this.id = new Int32Array(capacity);
  }
  push(cost: number, idx: number) {
    let i = this.sz++;
    this.d[i] = cost; this.id[i] = idx;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p] <= this.d[i]) break;
      this._swap(p, i); i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.d[0], this.id[0]];
    const last = --this.sz;
    if (last > 0) { this.d[0] = this.d[last]; this.id[0] = this.id[last]; this._sink(0); }
    return top;
  }
  get empty() { return this.sz === 0; }
  private _swap(a: number, b: number) {
    const t = this.d[a];  this.d[a]  = this.d[b];  this.d[b]  = t;
    const u = this.id[a]; this.id[a] = this.id[b]; this.id[b] = u;
  }
  private _sink(i: number) {
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < this.sz && this.d[l] < this.d[s]) s = l;
      if (r < this.sz && this.d[r] < this.d[s]) s = r;
      if (s === i) break;
      this._swap(s, i); i = s;
    }
  }
}

// Dijkstra shortest path for road generation (returns cell indices on path)
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
      // Very high cost for impassable terrain; reuse roads cheaply
      const cost = (ct === RIVER || ct === MOUNTAIN || ct === BLOCKED) ? 800
                 : ct === COMMERCIAL ? 4
                 : ct === ROAD      ? 0.3
                 : 1;
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

// ─── Access maps (terrain-aware weighted Dijkstra) ───────────────────────────
// Uses multi-source Dijkstra so rivers/mountains act as real barriers.
// Edge cost to enter a cell: ROAD=0.5, passable land=1.0, impassable=∞.
function buildAccessMaps(grid: Uint8Array, N: number): AccessMaps {
  const total = N * N;

  function weightedMultiSourceDijkstra(sources: number[]): Float32Array {
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
        // Impassable terrain: households behind a river truly can't reach commercial easily
        if (ct === RIVER || ct === MOUNTAIN || ct === BLOCKED) continue;
        // Roads are cheaper to traverse, reflecting their role in connectivity
        const edgeCost = ct === ROAD ? 0.5 : 1.0;
        const nd = d + edgeCost;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(nd, ni); }
      }
    }
    return dist;
  }

  const commSources: number[] = [];
  const roadSources: number[] = [];
  for (let i = 0; i < total; i++) {
    if (grid[i] === COMMERCIAL) commSources.push(i);
    if (grid[i] === ROAD)       roadSources.push(i);
  }

  const distToCommercial = weightedMultiSourceDijkstra(commSources);
  const distToRoad       = weightedMultiSourceDijkstra(roadSources);

  // Local commercial density: fraction of cells within radius 5 that are commercial
  const localCommercialDensity = new Float32Array(total);
  const DR = 5;
  const area = (2 * DR + 1) ** 2;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let cnt = 0;
    for (let dr = -DR; dr <= DR; dr++) for (let dc = -DR; dc <= DR; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr * N + nc] === COMMERCIAL) cnt++;
    }
    localCommercialDensity[r * N + c] = cnt / area;
  }
  return { distToCommercial, distToRoad, localCommercialDensity };
}

// ─── Economic functions ───────────────────────────────────────────────────────
function accessibility(idx: number, maps: AccessMaps, N: number): number {
  const w1 = 0.4, w2 = 0.3, w3 = 0.3;
  const dCom  = maps.distToCommercial[idx];
  const dRoad = maps.distToRoad[idx];
  const rho   = maps.localCommercialDensity[idx];
  const scale = N * 0.12;
  const invNormCom  = 1 / (1 + (isFinite(dCom)  ? dCom  : N) / scale);
  const invNormRoad = 1 / (1 + (isFinite(dRoad) ? dRoad : N) / (scale * 0.5));
  return w1 * invNormCom + w2 * invNormRoad + w3 * Math.min(1, rho * 25);
}

function ageIncomeFactor(age: number, maxAge: number): number {
  if (age < 18) return 0.2;
  if (age < 45) return 0.2 + 0.8 * (age - 18) / 27;
  if (age < 60) return 1.0;
  return Math.max(0.1, 1.0 - 0.5 * (age - 60) / Math.max(1, maxAge - 60));
}

function computeIncome(h: Household, acc: number, cfg: Config, noise: number): number {
  const g = ageIncomeFactor(h.age, cfg.maxAge);
  return Math.max(0,
    cfg.baseIncome * (1 + cfg.moneyIqEffect * h.moneyIq) * (1 + cfg.accessibilityIncomeEffect * acc) * g + noise
  );
}

function localPopDensity(idx: number, grid: Uint8Array, N: number): number {
  const r = Math.floor(idx / N), c = idx % N;
  const DR = 3;
  let cnt = 0;
  for (let dr = -DR; dr <= DR; dr++) for (let dc = -DR; dc <= DR; dc++) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr * N + nc] === RESIDENTIAL) cnt++;
  }
  return cnt / ((2 * DR + 1) ** 2);
}

function computePrice(acc: number, popDen: number, cfg: Config, demand = 0): number {
  return Math.max(0, cfg.basePrice + cfg.accessibilityPriceEffect * acc + cfg.densityPriceEffect * popDen + cfg.demandPriceEffect * demand);
}

function computeSatisfaction(
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
        if (nh) {
          const diff = Math.abs(h.income - nh.income) / Math.max(1, Math.abs(h.income) + 1);
          if (diff < 0.35) similar++;
        }
      }
    }
  }
  return occupied === 0 ? 0.5 : similar / occupied;
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
      moneyIq: miq, age, deathAge,
      income: cfg.baseIncome * miq,
      wealth: Math.max(0, gaussRng(rng) * 30 + 50),
      savingPropensity: 0.1 + rng() * 0.3,
      movePressure: 0, satisfaction: 0.5,
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
): number {
  let deaths = 0;

  // Demand decay
  for (let i = 0; i < demandMap.length; i++) demandMap[i] *= cfg.demandDecay;

  // Phase 1: Age + death/inheritance
  for (const [, h] of households) {
    h.age++;
    if (h.age >= h.deathAge) {
      deaths++;
      const oldMiq = h.moneyIq;
      const oldWealth = h.wealth;
      h.moneyIq = Math.max(0.01, Math.min(0.99, cfg.moneyIqPersistence * oldMiq + (1 - cfg.moneyIqPersistence) * (0.5 + gaussRng(rng) * 0.2)));
      h.wealth = cfg.inheritanceRetention * Math.max(0, oldWealth);
      h.age = 0;
      h.deathAge = Math.max(30, Math.round(cfg.avgDeathAge + gaussRng(rng) * 8));
      h.savingPropensity = 0.1 + rng() * 0.3;
    }
  }

  // Phase 2: Income, price, wealth update, move pressure
  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    const noise = gaussRng(rng) * (cfg.baseIncome * 0.05);
    h.income = computeIncome(h, acc, cfg, noise);

    const popDen = localPopDensity(idx, grid, N);
    const price  = computePrice(acc, popDen, cfg, demandMap[idx]);

    // Wealth: W(t+1) = W(t) + s_h·Y_h − P(x_h)
    // Consumption C = (1−s)·Y is implicitly the non-saved share and does NOT
    // separately subtract from wealth; only rent/housing cost P is deducted.
    h.wealth += h.savingPropensity * h.income - price;

    // Affordability stress: Aff = max(0, P(x) − κ·Y)
    const aff = Math.max(0, price - cfg.affordabilityKappa * h.income);

    h.satisfaction = computeSatisfaction(idx, h, grid, households, N);

    // Move pressure (score only — NOT the threshold):
    // P_move = γ_A·A(x) + γ_F·Aff + γ_Q·(1−Q(x))
    h.movePressure = cfg.accessibilityToleranceEffect * acc
      + cfg.affordabilityEffect * aff
      + cfg.socialDissatisfactionEffect * (1 - h.satisfaction);
  }

  // Phase 3: Relocate households whose move pressure exceeds τ_move
  const emptyArr: number[] = [];
  for (let i = 0; i < N * N; i++) if (grid[i] === EMPTY) emptyArr.push(i);

  const movers: [number, Household][] = [];
  for (const [idx, h] of households) {
    // Compare score against user-controlled threshold τ_move (baseMoveThreshold)
    if (h.movePressure > cfg.baseMoveThreshold) movers.push([idx, h]);
  }
  for (let i = movers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [movers[i], movers[j]] = [movers[j], movers[i]];
  }
  for (const [fromIdx, h] of movers) {
    if (emptyArr.length === 0) break;
    const sampleSize = Math.min(25, emptyArr.length);
    let bestUtil = -Infinity, bestTarget = -1;
    for (let s = 0; s < sampleSize; s++) {
      const si = Math.floor(rng() * emptyArr.length);
      const cand = emptyArr[si];
      const candAcc = accessibility(cand, maps, N);
      const candPopDen = localPopDensity(cand, grid, N);
      const candPrice = computePrice(candAcc, candPopDen, cfg);
      grid[cand] = RESIDENTIAL;
      const candQ = computeSatisfaction(cand, h, grid, households, N);
      grid[cand] = EMPTY;
      const fromR = Math.floor(fromIdx / N), fromC = fromIdx % N;
      const toR = Math.floor(cand / N), toC = cand % N;
      const travel = (Math.abs(fromR - toR) + Math.abs(fromC - toC)) / N;
      const util = 0.30 * candQ + 0.30 * candAcc - 0.20 * (candPrice / Math.max(1, cfg.basePrice)) - 0.20 * travel;
      if (util > bestUtil) { bestUtil = util; bestTarget = cand; }
    }
    if (bestTarget !== -1) {
      grid[fromIdx] = EMPTY;
      grid[bestTarget] = RESIDENTIAL;
      households.delete(fromIdx);
      households.set(bestTarget, h);
      demandMap[bestTarget] = Math.min(1, demandMap[bestTarget] + 1);
      const ei = emptyArr.indexOf(bestTarget);
      if (ei !== -1) emptyArr[ei] = fromIdx; else emptyArr.push(fromIdx);
    }
  }
  return deaths;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function getCellColor(
  idx: number, grid: Uint8Array, households: Map<number, Household>,
  cfg: Config, ranges: { maxIncome: number; maxWealth: number }
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
  const t = Math.max(0, Math.min(1, h.movePressure));
  if (t < 0.5) return lerpRGB([20, 60, 180], [200, 130, 0], t / 0.5);
  return lerpRGB([200, 130, 0], [210, 20, 20], (t - 0.5) / 0.5);
}

// ─── Spatial segregation ─────────────────────────────────────────────────────
// For each household, classify by income tercile (bottom/mid/top third of the
// current distribution), then compute the fraction of residential Moore
// neighbours that share the same tercile.  Average across all households gives
// a value in [0,1]: 0 = perfectly mixed, 1 = fully clustered by income band.
function computeSpatialSegregation(
  grid: Uint8Array, households: Map<number, Household>, N: number
): number {
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

// ─── Metrics computation ──────────────────────────────────────────────────────
function computeMetrics(
  grid: Uint8Array, households: Map<number, Household>, N: number,
  cfg: Config, maps: AccessMaps, prev: Metrics, deaths: number
): { metrics: Metrics; ranges: { maxIncome: number; maxWealth: number } } {
  let sumIncome = 0, sumWealth = 0, sumAge = 0, sumPrice = 0, sumAcc = 0;
  let sumAff = 0, wantMove = 0, sumDistCom = 0, sumDistRoad = 0;
  let maxIncome = 1, maxWealth = 1;
  const incomes: number[] = [];
  const ageArr: number[] = [];
  const incomeArr: number[] = [];
  const accArr: number[] = [];

  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    const popDen = localPopDensity(idx, grid, N);
    const price = computePrice(acc, popDen, cfg);
    const aff = Math.max(0, price - cfg.affordabilityKappa * h.income);
    sumIncome += h.income;
    sumWealth += h.wealth;
    sumAge += h.age;
    sumPrice += price;
    sumAcc += acc;
    sumAff += aff;
    if (h.movePressure > 0.5) wantMove++;
    sumDistCom += isFinite(maps.distToCommercial[idx]) ? maps.distToCommercial[idx] : N;
    sumDistRoad += isFinite(maps.distToRoad[idx]) ? maps.distToRoad[idx] : N;
    incomes.push(h.income);
    if (h.income > maxIncome) maxIncome = h.income;
    if (h.wealth > maxWealth) maxWealth = h.wealth;
    ageArr.push(h.age);
    incomeArr.push(h.income);
    accArr.push(acc);
  }

  const n = Math.max(1, households.size);
  const avgIncome = sumIncome / n;
  const avgWealth = sumWealth / n;
  const avgAge = sumAge / n;
  const avgLocalPrice = sumPrice / n;
  const avgAccessibility = sumAcc / n;
  const avgAffordabilityStress = sumAff / n;
  const pctWantingToMove = (wantMove / n) * 100;
  const avgDistCommercial = sumDistCom / n;
  const avgDistRoad = sumDistRoad / n;

  // Income inequality: Gini coefficient over household incomes
  incomes.sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < incomes.length; i++) giniNum += (2 * (i + 1) - incomes.length - 1) * incomes[i];
  const incomeInequalityGini = incomes.length > 1
    ? giniNum / (incomes.length * incomes.length * (avgIncome || 1)) : 0;

  // Spatial segregation: average same-income-band neighbour fraction
  const spatialSegregation = computeSpatialSegregation(grid, households, N);

  const totalDeaths = prev.totalDeaths + deaths;

  const push = (arr: number[], val: number) => {
    const next = [...arr, val];
    return next.length > MAX_HIST ? next.slice(next.length - MAX_HIST) : next;
  };

  const makeDist = (arr: number[], bins: number): number[] => {
    if (arr.length === 0) return Array(bins).fill(0);
    const lo = Math.min(...arr), hi = Math.max(...arr);
    const range = hi - lo || 1;
    const counts = Array<number>(bins).fill(0);
    for (const v of arr) counts[Math.min(bins - 1, Math.floor(((v - lo) / range) * bins))]++;
    return counts;
  };
  const ageDist    = makeDist(ageArr, 10);
  const incomeDist = makeDist(incomeArr, 10);
  const accessDist = makeDist(accArr, 10);

  return {
    metrics: {
      step: prev.step + 1,
      avgIncome, avgWealth, avgAge, avgLocalPrice, avgAccessibility,
      avgAffordabilityStress, pctWantingToMove, deathsThisStep: deaths,
      totalDeaths, incomeInequalityGini, spatialSegregation,
      avgDistCommercial, avgDistRoad, householdCount: households.size,
      avgIncomeHistory:       push(prev.avgIncomeHistory,       avgIncome),
      avgWealthHistory:       push(prev.avgWealthHistory,       avgWealth),
      avgAgeHistory:          push(prev.avgAgeHistory,          avgAge),
      pctMoveHistory:         push(prev.pctMoveHistory,         pctWantingToMove),
      incomeInequalityHistory:push(prev.incomeInequalityHistory,incomeInequalityGini * 100),
      spatialSegHistory:      push(prev.spatialSegHistory,      spatialSegregation * 100),
      avgPriceHistory:        push(prev.avgPriceHistory,        avgLocalPrice),
      deathsHistory:          push(prev.deathsHistory,          deaths),
      accessibilityHistory:   push(prev.accessibilityHistory,   avgAccessibility * 100),
      ageDist, incomeDist, accessDist,
    },
    ranges: { maxIncome, maxWealth },
  };
}

function emptyMetrics(): Metrics {
  return {
    step: 0, avgIncome: 0, avgWealth: 0, avgAge: 0, avgLocalPrice: 0,
    avgAccessibility: 0, avgAffordabilityStress: 0, pctWantingToMove: 0,
    deathsThisStep: 0, totalDeaths: 0,
    incomeInequalityGini: 0, spatialSegregation: 0,
    avgDistCommercial: 0, avgDistRoad: 0, householdCount: 0,
    avgIncomeHistory: [], avgWealthHistory: [], avgAgeHistory: [],
    pctMoveHistory: [], incomeInequalityHistory: [], spatialSegHistory: [],
    avgPriceHistory: [], deathsHistory: [], accessibilityHistory: [],
    ageDist: [], incomeDist: [], accessDist: [],
  };
}

// ─── Bloomberg-style KPI block ────────────────────────────────────────────────
function KpiBlock({ label, value, sub, color = "#c8c8c8" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
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
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: number;
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
  data: Record<string, number>[];
  lines: { key: string; color: string; name: string }[];
  height?: number;
  label: string;
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
function DistributionChart({ data, label, color }: {
  data: number[];
  label: string;
  color: string;
}) {
  const chartData = data.map((v, i) => ({ bin: i, count: v }));
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[8px] text-[#444] uppercase tracking-widest px-2 pt-1.5 pb-0.5">{label}</div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={chartData} margin={{ top: 2, right: 10, left: 0, bottom: 0 }} barCategoryGap="10%">
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" vertical={false} />
          <XAxis dataKey="bin" tick={false} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#444", fontSize: 8 }} tickLine={false} axisLine={false} width={30} />
          <Tooltip
            contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 9 }}
            itemStyle={{ color: "#aaa" }}
            cursor={{ fill: "#ffffff08" }}
          />
          <Bar dataKey="count" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Simulation2() {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics());
  const [running, setRunning] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gridRef         = useRef<Uint8Array>(new Uint8Array(0));
  const householdsRef   = useRef<Map<number, Household>>(new Map());
  const accessMapsRef   = useRef<AccessMaps | null>(null);
  const metricsRef      = useRef<Metrics>(emptyMetrics());
  const rangesRef       = useRef<{ maxIncome: number; maxWealth: number }>({ maxIncome: 1, maxWealth: 1 });
  const rngRef          = useRef<(() => number)>(makeRng(DEFAULT_CONFIG.seed));
  const runningRef      = useRef(false);
  const rafRef          = useRef<number>(0);
  const lastStepTimeRef = useRef<number>(0);
  const imageDataRef    = useRef<ImageData | null>(null);
  const displayColorsRef = useRef<Float32Array>(new Float32Array(0));
  const cfgRef          = useRef<Config>(DEFAULT_CONFIG);
  const demandMapRef    = useRef<Float32Array>(new Float32Array(0));

  // Keep cfgRef in sync
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // ─── Init / regenerate map ──────────────────────────────────────────────────
  const initSim = useCallback((config: Config) => {
    setGenerating(true);
    // Defer heavy work one frame so the "Generating…" overlay renders first
    setTimeout(() => {
      const rng = makeRng(config.seed);
      rngRef.current = rng;
      const { grid } = generateMap(config, rng);
      const households = initHouseholds(grid, config.gridSize, config, rng);
      const maps = buildAccessMaps(grid, config.gridSize);

      // Prime each household with correct income / price / satisfaction / move-pressure
      // so the initial display reflects the real model state, not placeholder zeros.
      for (const [idx, h] of households) {
        const acc  = accessibility(idx, maps, config.gridSize);
        h.income   = computeIncome(h, acc, config, 0); // no noise at init
        const popDen = localPopDensity(idx, grid, config.gridSize);
        const price  = computePrice(acc, popDen, config);
        const aff    = Math.max(0, price - config.affordabilityKappa * h.income);
        h.satisfaction = computeSatisfaction(idx, h, grid, households, config.gridSize);
        h.movePressure = config.accessibilityToleranceEffect * acc
          + config.affordabilityEffect * aff
          + config.socialDissatisfactionEffect * (1 - h.satisfaction);
      }

      gridRef.current       = grid;
      householdsRef.current = households;
      accessMapsRef.current = maps;

      const N = config.gridSize;
      displayColorsRef.current = new Float32Array(N * N * 3).fill(18);
      demandMapRef.current = new Float32Array(N * N).fill(0);

      // Compute real initial metrics (step stays 0 — use emptyMetrics as prev)
      const { metrics: initM, ranges: initR } = computeMetrics(
        grid, households, N, config, maps, emptyMetrics(), 0
      );
      // Correct step back to 0 since this is the initial state, not a tick
      initM.step = 0;
      metricsRef.current  = initM;
      rangesRef.current   = initR;
      setMetrics({ ...initM });
      setGenerating(false);
    }, 10);
  }, []);

  useEffect(() => {
    initSim(DEFAULT_CONFIG);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render canvas ──────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const N = cfgRef.current.gridSize;
    const grid = gridRef.current;
    const households = householdsRef.current;
    const config = cfgRef.current;
    const ranges = rangesRef.current;

    if (grid.length !== N * N) return;

    if (!imageDataRef.current || imageDataRef.current.width !== CANVAS_SIZE) {
      imageDataRef.current = new ImageData(CANVAS_SIZE, CANVAS_SIZE);
    }
    if (displayColorsRef.current.length !== N * N * 3) {
      displayColorsRef.current = new Float32Array(N * N * 3).fill(18);
    }

    const cellSize = CANVAS_SIZE / N;
    const dc = displayColorsRef.current;

    for (let idx = 0; idx < N * N; idx++) {
      const [tr, tg, tb] = getCellColor(idx, grid, households, config, ranges);
      const base = idx * 3;
      dc[base]     += (tr - dc[base])     * LERP_FACTOR;
      dc[base + 1] += (tg - dc[base + 1]) * LERP_FACTOR;
      dc[base + 2] += (tb - dc[base + 2]) * LERP_FACTOR;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const cs = cellSize;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const base = idx * 3;
        const pr = Math.round(dc[base]);
        const pg = Math.round(dc[base + 1]);
        const pb = Math.round(dc[base + 2]);
        ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
        ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }
  }, []);

  // Charts are now rendered declaratively via Recharts — no imperative draw needed.

  // ─── Animation loop ──────────────────────────────────────────────────────────
  const tick = useCallback((timestamp: number) => {
    if (!runningRef.current) return;
    const config = cfgRef.current;
    const elapsed = timestamp - lastStepTimeRef.current;

    if (elapsed >= config.speed) {
      lastStepTimeRef.current = timestamp;
      const grid = gridRef.current;
      const households = householdsRef.current;
      const maps = accessMapsRef.current;
      const N = config.gridSize;

      if (grid.length === N * N && maps) {
        const deaths = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
        const { metrics: newMetrics, ranges } = computeMetrics(
          grid, households, N, config, maps, metricsRef.current, deaths
        );
        metricsRef.current = newMetrics;
        rangesRef.current = ranges;
        setMetrics({ ...newMetrics });

        if (newMetrics.step >= config.maxSteps) {
          runningRef.current = false;
          setRunning(false);
          return;
        }
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

  // Keep rendering even when paused
  useEffect(() => {
    if (!running) {
      const id = requestAnimationFrame(() => renderCanvas());
      return () => cancelAnimationFrame(id);
    }
  }, [running, renderCanvas, metrics]);

  // ─── Controls ────────────────────────────────────────────────────────────────
  const handleStart = () => setRunning(true);
  const handlePause = () => setRunning(false);
  const handleReset = () => {
    setRunning(false);
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    initSim(cfgRef.current);
  };
  const handleStep = () => {
    if (running) return;
    const config = cfgRef.current;
    const grid = gridRef.current;
    const households = householdsRef.current;
    const maps = accessMapsRef.current;
    const N = config.gridSize;
    if (grid.length === N * N && maps) {
      const deaths = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
      const { metrics: newMetrics, ranges } = computeMetrics(
        grid, households, N, config, maps, metricsRef.current, deaths
      );
      metricsRef.current = newMetrics;
      rangesRef.current = ranges;
      setMetrics({ ...newMetrics });
      renderCanvas();
    }
  };
  const handleRegenMap = () => {
    if (running) return;
    initSim(cfgRef.current);
  };

  const updateCfg = <K extends keyof Config>(key: K, value: Config[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }));
    cfgRef.current = { ...cfgRef.current, [key]: value };
  };

  // ─── Slider helper ────────────────────────────────────────────────────────────
  const Slider = ({
    label, k, min, max, step = 1, decimals = 0,
  }: {
    label: string; k: keyof Config; min: number; max: number; step?: number; decimals?: number;
  }) => {
    const val = cfg[k] as number;
    const sliderId = `slider-${k}`;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <label htmlFor={sliderId} className="text-[10px] text-[#888]">{label}</label>
          <span className="text-[10px] text-[#aaa] font-mono">{val.toFixed(decimals)}</span>
        </div>
        <input
          id={sliderId}
          type="range" min={min} max={max} step={step}
          value={val}
          onChange={e => updateCfg(k, parseFloat(e.target.value) as Config[typeof k])}
          className="w-full h-1 accent-[#4466aa] cursor-pointer"
        />
      </div>
    );
  };

  // ─── Chart data (useMemo) ─────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const hist = metrics.avgIncomeHistory;
    const len = hist.length;
    return Array.from({ length: len }, (_, i) => ({
      t: i,
      income: +metrics.avgIncomeHistory[i].toFixed(2),
      wealth: +metrics.avgWealthHistory[i].toFixed(2),
      price:  +metrics.avgPriceHistory[i].toFixed(2),
      ineq:   +metrics.incomeInequalityHistory[i].toFixed(4),
      seg:    +metrics.spatialSegHistory[i].toFixed(4),
      pctMove: +metrics.pctMoveHistory[i].toFixed(2),
      access:  +metrics.accessibilityHistory[i].toFixed(4),
      age:     +metrics.avgAgeHistory[i].toFixed(2),
      deaths:  +metrics.deathsHistory[i].toFixed(0),
    }));
  }, [metrics]);

  const m = metrics;

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
          Geography-aware agent-based city model extending the Schelling segregation model with spatial
          economics, life cycles, inherited wealth, and road-aware accessibility.
        </p>

        {/* Math model expandable — equations rendered with KaTeX */}
        <div className="mt-3 border border-[#222] rounded">
          <button
            type="button"
            onClick={() => setMathOpen(o => !o)}
            className="w-full text-left px-3 py-2 text-[11px] text-[#777] hover:text-[#bbb] flex justify-between items-center transition-colors"
            aria-expanded={mathOpen ? "true" : "false"}
          >
            <span className="font-medium">Mathematical Model</span>
            <span className="text-[#555] text-[10px]">{mathOpen ? "collapse ▲" : "expand ▼"}</span>
          </button>
          {mathOpen && (
            <div className="px-4 pb-4 border-t border-[#1e1e1e] overflow-y-auto max-h-[70vh]">
              {((): { title: string; sym: string; num: string; note: string }[] => [
                {
                  title: "Household state",
                  sym: String.raw`S_h(t)=\bigl(x_h,\;M_h,\;a_h,\;D_h,\;Y_h,\;W_h,\;P_h^{\mathrm{move}}\bigr)`,
                  num: "",
                  note: "Location, Money-IQ, age, death age, income, wealth, move pressure.",
                },
                {
                  title: "Accessibility",
                  sym: String.raw`A(x)=w_1\,\mathrm{invNorm}(d_{\mathrm{com}})+w_2\,\mathrm{invNorm}(d_{\mathrm{road}})+w_3\,\rho_{\mathrm{com}}(x)`,
                  num: String.raw`=\;0.4\,\mathrm{invNorm}(d_{\mathrm{com}})+0.3\,\mathrm{invNorm}(d_{\mathrm{road}})+0.3\,\rho_{\mathrm{com}}(x)`,
                  note: "Terrain-aware weighted shortest-path distances. Barriers (rivers, mountains) are impassable.",
                },
                {
                  title: "Age–income profile",
                  sym: String.raw`g(a)=\begin{cases}0.2 & a<18\\0.2+0.8\,\frac{a-18}{27} & 18\le a<45\\1.0 & 45\le a<60\\1.0-0.5\,\frac{a-60}{A_{\max}-60} & a\ge 60\end{cases}`,
                  num: "",
                  note: "Hump-shaped lifecycle: low earnings when young, peak in working years, declining at retirement.",
                },
                {
                  title: "Income",
                  sym: String.raw`Y_h=Y_0(1+\alpha_M M_h)(1+\alpha_A A(x_h))g(a_h)+\varepsilon_h`,
                  num: `=\\;${cfg.baseIncome}(1+${cfg.moneyIqEffect}\\,M_h)(1+${cfg.accessibilityIncomeEffect}\\,A(x_h))g(a_h)+\\varepsilon_h`,
                  note: "Depends on intrinsic Money-IQ, location accessibility, and lifecycle stage.",
                },
                {
                  title: "Local housing price",
                  sym: String.raw`P(x)=P_0+\beta_A A(x)+\beta_D\,\rho_{\mathrm{pop}}(x)+\beta_{\mathrm{dem}}\,d(x)`,
                  num: `=\\;${cfg.basePrice}+${cfg.accessibilityPriceEffect}\\,A(x)+${cfg.densityPriceEffect}\\,\\rho_{\\mathrm{pop}}+${cfg.demandPriceEffect}\\,d(x)`,
                  note: `Demand d(x) accumulates when movers target a cell; decays by ${cfg.demandDecay} per step. Hot neighbourhoods become more expensive.`,
                },
                {
                  title: "Wealth accumulation",
                  sym: String.raw`W_h(t+1)=W_h(t)+s_h Y_h(t)-P(x_h)`,
                  num: "",
                  note: "Saving rate s_h ∈ [0.1, 0.4] retains a share of income; housing cost P is deducted each step.",
                },
                {
                  title: "Affordability stress",
                  sym: String.raw`\mathrm{Aff}_h=\max\!\bigl(0,\;P(x_h)-\kappa Y_h\bigr)`,
                  num: `=\\;\\max(0,\\;P(x_h)-${cfg.affordabilityKappa}\\,Y_h)`,
                  note: "Positive when housing cost exceeds the affordable fraction κ of income.",
                },
                {
                  title: "Move pressure (score)",
                  sym: String.raw`P_h^{\mathrm{move}}=\gamma_A A(x_h)+\gamma_F\mathrm{Aff}_h+\gamma_Q(1-Q_h(x_h))`,
                  num: `=\\;${cfg.accessibilityToleranceEffect}\\,A(x_h)+${cfg.affordabilityEffect}\\,\\mathrm{Aff}_h+${cfg.socialDissatisfactionEffect}(1-Q_h(x_h))`,
                  note: "Relocation triggered when this score exceeds the threshold τ_move.",
                },
                {
                  title: "Relocation condition",
                  sym: String.raw`P_h^{\mathrm{move}}>\tau_{\mathrm{move}}`,
                  num: `>\\;${cfg.baseMoveThreshold}`,
                  note: "τ_move is the 'Move threshold' slider; the score and threshold are kept separate.",
                },
                {
                  title: "Relocation utility",
                  sym: String.raw`U_h(x)=\lambda_1 Q_h(x)+\lambda_2 A(x)-\lambda_3 P(x)-\lambda_4 T(x)`,
                  num: String.raw`=\;0.30\,Q_h(x)+0.30\,A(x)-0.20\,P(x)-0.20\,T(x)`,
                  note: "Candidate cell chosen to maximise social fit, accessibility, low price, and low travel burden.",
                },
                {
                  title: "Wealth inheritance",
                  sym: String.raw`W_h^{\mathrm{new}}=\rho_W W_h^{\mathrm{old}}`,
                  num: `=\\;${cfg.inheritanceRetention}\\,W_h^{\\mathrm{old}}`,
                  note: "Fraction ρW of wealth transfers to the new generation at household death.",
                },
                {
                  title: "Money-IQ inheritance",
                  sym: String.raw`M_h^{\mathrm{new}}=\eta M_h^{\mathrm{old}}+(1-\eta)\,\varepsilon_h`,
                  num: `=\\;${cfg.moneyIqPersistence}\\,M_h^{\\mathrm{old}}+${(1 - cfg.moneyIqPersistence).toFixed(2)}\\,\\varepsilon_h`,
                  note: "η controls intergenerational persistence; ε is a fresh random draw.",
                },
              ])().map(({ title, sym, num, note }) => (
                <div key={title} className="mt-3 first:mt-2">
                  <div className="text-[10px] font-medium text-[#888] uppercase tracking-wider mb-1">{title}</div>
                  <div
                    className="overflow-x-auto py-1 px-2 bg-[#0d0d0d] rounded border border-[#1e1e1e] text-[#ccc]"
                    dangerouslySetInnerHTML={{
                      __html: katex.renderToString(sym, { throwOnError: false, displayMode: true }),
                    }}
                  />
                  {num && (
                    <div
                      className="overflow-x-auto py-1 px-2 mt-px bg-[#0a0a0a] rounded border border-[#1a1a1a] text-[#7a9a6a]"
                      dangerouslySetInnerHTML={{
                        __html: katex.renderToString(num, { throwOnError: false, displayMode: true }),
                      }}
                    />
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
          <div
            className="border border-[#1c1c1c] rounded overflow-hidden relative"
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          >
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} />
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#080808aa] text-[#666] text-sm">
                Generating map…
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="border border-[#1c1c1c] rounded px-3 py-2">
            <div className="text-[9px] text-[#555] uppercase mb-1.5">Legend</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { color: "rgb(18,18,18)",  label: "Empty" },
                { color: "rgb(55,35,110)", label: "Commercial" },
                { color: "rgb(58,52,46)",  label: "Road" },
                { color: "rgb(8,25,65)",   label: "River" },
                { color: "rgb(28,42,22)",  label: "Mountain" },
                { color: "rgb(38,22,22)",  label: "Blocked" },
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

          {/* KPI rows — Bloomberg compact blocks */}
          <div className="grid grid-cols-4 gap-px bg-[#161616]">
            <KpiBlock label="Step"         value={m.step.toLocaleString()}                    color="#e0e0e0" />
            <KpiBlock label="Agents"        value={m.householdCount.toLocaleString()}           color="#aaaaaa" />
            <KpiBlock label="Avg Income"    value={m.avgIncome.toFixed(1)}                     color="#22cccc" />
            <KpiBlock label="Avg Wealth"    value={m.avgWealth.toFixed(1)}                     color="#aa88ee" />
            <KpiBlock label="Avg Age"       value={m.avgAge.toFixed(1)}                        color={m.avgAge > 60 ? "#cc4422" : "#44bb77"} />
            <KpiBlock label="Avg Price"     value={m.avgLocalPrice.toFixed(1)}                 color="#dd8800" />
            <KpiBlock label="Access ×100"   value={(m.avgAccessibility * 100).toFixed(1)}      color="#5577cc" />
            <KpiBlock label="Aff. Stress"   value={m.avgAffordabilityStress.toFixed(2)}        color={m.avgAffordabilityStress > 5 ? "#cc2222" : "#888"} sub="max(0,P−κY)" />
          </div>
          <div className="grid grid-cols-4 gap-px bg-[#161616] mt-px">
            <KpiBlock label="% Want Move"   value={m.pctWantingToMove.toFixed(1) + "%"}        color={m.pctWantingToMove > 50 ? "#cc2222" : "#999"} />
            <KpiBlock label="Deaths"        value={m.totalDeaths.toLocaleString()}             color="#666" sub={`+${m.deathsThisStep}/step`} />
            <KpiBlock label="Gini"          value={m.incomeInequalityGini.toFixed(3)}          color={m.incomeInequalityGini > 0.4 ? "#cc2222" : "#999"} sub="income ineq." />
            <KpiBlock label="Spatial Seg."  value={m.spatialSegregation.toFixed(3)}            color={m.spatialSegregation > 0.6 ? "#cc2222" : m.spatialSegregation > 0.4 ? "#cc8800" : "#999"} sub="same-band nbrs" />
            <KpiBlock label="Dist Comm."    value={m.avgDistCommercial.toFixed(1)}             color="#555" sub="wtd cells" />
            <KpiBlock label="Dist Road"     value={m.avgDistRoad.toFixed(1)}                   color="#555" sub="wtd cells" />
            <KpiBlock label="Population"    value={`${((m.householdCount / Math.max(1, cfg.gridSize * cfg.gridSize * 0.8)) * 100).toFixed(1)}%`} color="#4488aa" sub="density" />
            <KpiBlock label="Seed"          value={String(cfg.seed)}                           color="#333" />
          </div>

          {/* Recharts chart strips */}
          <div className="flex flex-col gap-px mt-px">
            <ChartStrip
              label="Income · Wealth · Price"
              data={chartData}
              lines={[
                { key: "income", color: "#22cccc", name: "Income" },
                { key: "wealth", color: "#aa88ee", name: "Wealth" },
                { key: "price",  color: "#dd8800", name: "Price"  },
              ]}
              height={130}
            />
            <ChartStrip
              label="Gini · Spatial Segregation"
              data={chartData}
              lines={[
                { key: "ineq", color: "#cc4444", name: "Gini" },
                { key: "seg",  color: "#cc8800", name: "Seg."  },
              ]}
              height={120}
            />
            <ChartStrip
              label="% Wanting Move · Accessibility"
              data={chartData}
              lines={[
                { key: "pctMove", color: "#ee6633", name: "Move%" },
                { key: "access",  color: "#5577cc", name: "Access" },
              ]}
              height={120}
            />
            <ChartStrip
              label="Avg Age · Deaths / Step"
              data={chartData}
              lines={[
                { key: "age",    color: "#44bb77", name: "Age"    },
                { key: "deaths", color: "#666666", name: "Deaths" },
              ]}
              height={120}
            />
            <div className="flex flex-col gap-px mt-2">
              <DistributionChart data={m.ageDist}    label="Age distribution (snapshot)"          color="#44bb77" />
              <DistributionChart data={m.incomeDist} label="Income distribution (snapshot)"        color="#22cccc" />
              <DistributionChart data={m.accessDist} label="Accessibility distribution (snapshot)" color="#5577cc" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 border border-[#1a1a1a] rounded p-3">

        {/* Buttons row */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button type="button"
            onClick={handleStart} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a3a1a] border border-[#2a5a2a] text-[#66cc66] hover:bg-[#223a22] disabled:opacity-40 transition-colors"
          >Start</button>
          <button type="button"
            onClick={handlePause} disabled={!running}
            className="px-3 py-1.5 text-xs rounded bg-[#3a2a00] border border-[#5a4400] text-[#ccaa00] hover:bg-[#4a3800] disabled:opacity-40 transition-colors"
          >Pause</button>
          <button type="button"
            onClick={handleReset} disabled={generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:bg-[#222] disabled:opacity-40 transition-colors"
          >Reset</button>
          <button type="button"
            onClick={handleStep} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#0e1a2e] border border-[#1a2e4a] text-[#4488cc] hover:bg-[#142238] disabled:opacity-40 transition-colors"
          >Step</button>
          <button type="button"
            onClick={handleRegenMap} disabled={running || generating}
            className="px-3 py-1.5 text-xs rounded bg-[#1a1020] border border-[#2a1a38] text-[#9966cc] hover:bg-[#221430] disabled:opacity-40 transition-colors"
          >Regenerate Map</button>

          {/* Running state indicator */}
          <span className={`ml-2 px-2 py-1 text-[10px] rounded border font-mono ${
            running
              ? "bg-[#0e2010] border-[#1a4020] text-[#44bb66]"
              : generating
              ? "bg-[#1a1020] border-[#2a1538] text-[#9966cc]"
              : "bg-[#111] border-[#222] text-[#555]"
          }`}>
            {running ? "● RUNNING" : generating ? "⟳ GENERATING" : "■ PAUSED"}
          </span>
          <span className="text-[10px] text-[#444] font-mono ml-1">seed:{cfg.seed}</span>

          <div className="ml-auto flex items-center gap-1">
            <span className="text-[9px] text-[#555] mr-1">Color mode:</span>
            {(["income", "wealth", "age", "movePressure"] as const).map(mode => (
              <button
                type="button"
                key={mode}
                onClick={() => updateCfg("colorMode", mode)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  cfg.colorMode === mode
                    ? "bg-[#1a2a3a] border-[#2a4a6a] text-[#88aadd]"
                    : "bg-[#111] border-[#1e1e1e] text-[#555] hover:text-[#888]"
                }`}
              >
                {mode === "movePressure" ? "pressure" : mode}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[#1c1c1c]">
          <span className="text-[10px] text-[#555] uppercase tracking-wider w-12 shrink-0">Presets</span>
          {([
            {
              label: "Balanced",
              tip: "Mixed terrain, moderate inequality, medium mobility",
              patch: { riverAmount: 2, mountainAmount: 2, moneyIqEffect: 0.5, accessibilityPriceEffect: 20, baseMoveThreshold: 0.35, inheritanceRetention: 0.8 },
            },
            {
              label: "High Inequality",
              tip: "Strong Money-IQ effect, high access premium, low inheritance",
              patch: { moneyIqEffect: 1.5, accessibilityIncomeEffect: 0.7, accessibilityPriceEffect: 40, inheritanceRetention: 0.3, moneyIqPersistence: 0.8 },
            },
            {
              label: "Central Pricing",
              tip: "Expensive cores, cheap periphery — strong displacement pressure",
              patch: { accessibilityPriceEffect: 50, densityPriceEffect: 15, affordabilityEffect: 0.3, baseMoveThreshold: 0.2 },
            },
            {
              label: "Barrier-Heavy",
              tip: "Many rivers and mountains fragment accessibility",
              patch: { riverAmount: 4, mountainAmount: 4, blockedAmount: 3, roadDensity: 1.8, commercialCount: 4 },
            },
            {
              label: "Sticky Households",
              tip: "Low move pressure — households rarely relocate",
              patch: { baseMoveThreshold: 0.8, affordabilityEffect: 0.02, socialDissatisfactionEffect: 0.03, accessibilityToleranceEffect: -0.1 },
            },
          ] as { label: string; tip: string; patch: Partial<Config> }[]).map(({ label, tip, patch }) => (
            <button
              key={label}
              type="button"
              title={tip}
              disabled={running || generating}
              onClick={() => {
                const next = { ...cfgRef.current, ...patch };
                cfgRef.current = next;
                setCfg(next);
                initSim(next);
              }}
              className="px-2.5 py-1 text-[10px] rounded border border-[#2a2a2a] bg-[#141414] text-[#777] hover:text-[#bbb] hover:border-[#3a3a3a] disabled:opacity-40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sliders grid */}
        <div className="grid grid-cols-4 gap-x-6 gap-y-0.5">

          {/* Col 1: Geography */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Geography</div>
            <Slider label="Grid size" k="gridSize" min={40} max={100} />
            <Slider label="Rivers" k="riverAmount" min={0} max={4} />
            <Slider label="Mountains" k="mountainAmount" min={0} max={4} />
            <Slider label="Blocked areas" k="blockedAmount" min={0} max={3} />
          </div>

          {/* Col 2: Districts & Roads */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Districts & Roads</div>
            <Slider label="Commercial count" k="commercialCount" min={1} max={5} />
            <Slider label="Commercial compactness" k="commercialCompactness" min={0.3} max={1.0} step={0.05} decimals={2} />
            <Slider label="Road density" k="roadDensity" min={0.5} max={2.0} step={0.1} decimals={1} />
            <Slider label="Population density" k="populationDensity" min={0.1} max={0.7} step={0.05} decimals={2} />
          </div>

          {/* Col 3: Economy */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Economy</div>
            <Slider label="Base income Y₀" k="baseIncome" min={10} max={200} />
            <Slider label="MoneyIQ effect αM" k="moneyIqEffect" min={-1} max={2} step={0.05} decimals={2} />
            <Slider label="Accessibility income αA" k="accessibilityIncomeEffect" min={-1} max={1} step={0.05} decimals={2} />
            <Slider label="Base price P₀" k="basePrice" min={1} max={50} />
            <Slider label="Access. price βA" k="accessibilityPriceEffect" min={-20} max={50} />
            <Slider label="Density price βD" k="densityPriceEffect" min={0} max={20} />
            <Slider label="Inheritance ρW" k="inheritanceRetention" min={0} max={1} step={0.05} decimals={2} />
            <Slider label="MoneyIQ persist. η" k="moneyIqPersistence" min={0} max={1} step={0.05} decimals={2} />
            <Slider label="Afford. kappa κ" k="affordabilityKappa" min={0.1} max={1.0} step={0.05} decimals={2} />
            <Slider label="Demand price βDem" k="demandPriceEffect" min={0} max={30} step={1} />
            <Slider label="Demand decay" k="demandDecay" min={0.5} max={1.0} step={0.01} decimals={2} />
          </div>

          {/* Col 4: Mobility & Lifecycle */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-1">Mobility & Lifecycle</div>
            <Slider label="Max age A_max" k="maxAge" min={60} max={120} />
            <Slider label="Avg death age D̄" k="avgDeathAge" min={40} max={90} />
            <Slider label="Access. tolerance γA" k="accessibilityToleranceEffect" min={-0.2} max={0.2} step={0.01} decimals={2} />
            <Slider label="Affordability effect γF" k="affordabilityEffect" min={0} max={0.5} step={0.01} decimals={2} />
            <Slider label="Social dissatisf. γQ" k="socialDissatisfactionEffect" min={0} max={0.5} step={0.01} decimals={2} />
            <Slider label="Move threshold τ" k="baseMoveThreshold" min={0} max={1} step={0.01} decimals={2} />
            <Slider label="Speed (ms/step)" k="speed" min={50} max={500} />
            <Slider label="Max steps" k="maxSteps" min={100} max={10000} step={100} />
            <Slider label="Seed" k="seed" min={0} max={9999} />
          </div>
        </div>
      </div>
    </div>
  );
}
