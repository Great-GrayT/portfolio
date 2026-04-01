"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import {
  BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import katex from "katex";
import "katex/dist/katex.min.css";

// ─── Cell constants ───────────────────────────────────────────────────────────
const EMPTY = 0, RESIDENTIAL = 1, COMMERCIAL = 2, ROAD = 3, RIVER = 4, MOUNTAIN = 5, BLOCKED = 6;
const CANVAS_SIZE = 600;
const MAX_HIST = 300;
const LERP_FACTOR = 0.12;

// ─── Types ────────────────────────────────────────────────────────────────────
type TenureType = "renter" | "mortgage" | "outright";

interface Household {
  group: number;
  moneyIq: number;
  age: number;
  deathAge: number;
  income: number;
  savingPropensity: number;
  utility: number;
  satisfaction: number;
  groupFit: number;
  // Balance sheet
  liquidWealth: number;       // W_L: liquid assets
  housingOwnedValue: number;  // H_V: current market value of owned home (0 if renter)
  debtPrincipal: number;      // D: outstanding debt (mortgage + consumer overdraft)
  debtRate: number;           // r: per-step interest rate on debt
  debtPayment: number;        // Pay_D: per-step amortization payment
  tenureType: TenureType;
  consumption: number;        // C_h: last computed consumption
  arrears: number;            // A_h: consecutive missed-payment steps
  defaultCount: number;       // lifetime default events
}

function netWorthOf(h: Household): number {
  return h.liquidWealth + h.housingOwnedValue - h.debtPrincipal;
}

interface Config {
  gridSize: number; riverAmount: number; mountainAmount: number; blockedAmount: number;
  commercialCount: number; commercialCompactness: number; roadDensity: number; populationDensity: number;
  maxAge: number; avgDeathAge: number;
  baseIncome: number; moneyIqEffect: number; accessibilityIncomeEffect: number;
  basePrice: number; accessibilityPriceEffect: number; densityPriceEffect: number;
  demandPriceEffect: number; demandDecay: number;
  inheritanceRetention: number; moneyIqPersistence: number;
  // Financing
  installmentN: number; installmentM: number;
  rentFactor: number;       // rent per step as fraction of price
  maintenanceRate: number;  // maintenance per step as fraction of home value
  overdraftRate: number;    // consumer debt growth rate per step
  consumptionPhi: number;   // marginal propensity to consume (φ)
  // Utility weights
  lambdaC: number; lambdaH: number; lambdaA: number; lambdaN: number;
  lambdaS: number; lambdaT: number; lambdaW: number; lambdaD: number;
  lambdaArr: number; lambdaG: number;
  // Affordability
  affordabilityKappa: number; basicCost: number; commuteCostFactor: number;
  // Move
  utilityThreshold: number; movingCostBase: number; movingCostDist: number;
  // Schelling
  numGroups: number; groupTolerance: number;
  // Simulation
  speed: number; maxSteps: number; seed: number;
  colorMode: "income" | "liquidwealth" | "networth" | "debt" | "age" | "utility" | "group" | "tenure";
}

interface AccessMaps {
  distToCommercial: Float32Array;
  distToRoad: Float32Array;
  localCommercialDensity: Float32Array;
  housingServiceMap: Float32Array;
  neighborhoodQualityMap: Float32Array;
}

interface Metrics {
  step: number; householdCount: number;
  avgIncome: number; avgLiquidWealth: number; avgNetWorth: number; avgDebtPrincipal: number;
  avgDebtToIncome: number; avgConsumption: number; avgHousingPayment: number;
  avgLocalPrice: number; avgAccessibility: number; avgDistCommercial: number; avgDistRoad: number;
  pctRenter: number; pctMortgage: number; pctOutright: number;
  avgArrears: number; defaultsThisStep: number; totalDefaults: number;
  pctAffordable: number; avgAge: number; deathsThisStep: number; totalDeaths: number;
  avgUtility: number; incomeGini: number; wealthGini: number;
  spatialSegregation: number; movesThisStep: number;
  avgSameGroupExposure: number; groupSegIndex: number;
  // History
  avgIncomeHistory: number[]; avgLiquidWealthHistory: number[]; avgNetWorthHistory: number[];
  avgDebtHistory: number[]; avgDebtToIncomeHistory: number[]; avgUtilityHistory: number[];
  avgConsumptionHistory: number[]; pctMoveHistory: number[]; incomeGiniHistory: number[];
  wealthGiniHistory: number[]; spatialSegHistory: number[]; avgPriceHistory: number[];
  deathsHistory: number[]; accessibilityHistory: number[];
  avgSameGroupHistory: number[]; groupSegHistory2: number[];
  pctRenterHistory: number[]; pctMortgageHistory: number[]; pctOutrightHistory: number[];
  avgArrearsHistory: number[]; defaultsHistory: number[]; avgAgeHistory: number[];
}

interface VizData {
  liquidWealthDist: { bin: string; count: number }[];
  netWorthDist: { bin: string; count: number }[];
  incomeDist: { bin: string; count: number }[];
  debtDist: { bin: string; count: number }[];
  consumptionDist: { bin: string; count: number }[];
  utilityDist: { bin: string; count: number }[];
  scatterData: {
    age: number; income: number; acc: number; utility: number;
    liquidWealth: number; netWorth: number; debt: number; consumption: number;
  }[];
}

// ─── Default config ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG: Config = {
  gridSize: 75, riverAmount: 2, mountainAmount: 2, blockedAmount: 1,
  commercialCount: 3, commercialCompactness: 0.7, roadDensity: 1.0, populationDensity: 0.4,
  maxAge: 90, avgDeathAge: 72,
  baseIncome: 50, moneyIqEffect: 0.5, accessibilityIncomeEffect: 0.3,
  basePrice: 100, accessibilityPriceEffect: 80, densityPriceEffect: 20,
  demandPriceEffect: 30, demandDecay: 0.92,
  inheritanceRetention: 0.8, moneyIqPersistence: 0.5,
  installmentN: 24, installmentM: 0.015,
  rentFactor: 0.06, maintenanceRate: 0.004, overdraftRate: 0.03, consumptionPhi: 0.40,
  lambdaC: 0.30, lambdaH: 0.08, lambdaA: 0.18, lambdaN: 0.12,
  lambdaS: 0.08, lambdaT: 0.08, lambdaW: 0.18, lambdaD: 0.25, lambdaArr: 0.10, lambdaG: 0.12,
  affordabilityKappa: 0.40, basicCost: 5, commuteCostFactor: 0.12,
  utilityThreshold: 0.05, movingCostBase: 0.08, movingCostDist: 0.08,
  numGroups: 2, groupTolerance: 0.30,
  speed: 120, maxSteps: 5000, seed: 42,
  colorMode: "income",
};

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
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
  const u1 = Math.max(1e-10, rng()), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Map generation ───────────────────────────────────────────────────────────
function generateRivers(grid: Uint8Array, N: number, count: number, rng: () => number): void {
  for (let r = 0; r < count; r++) {
    const startEdge = Math.floor(rng() * 4);
    let row: number, col: number, primaryDr: number, primaryDc: number;
    if (startEdge === 0) { row = 0; col = Math.floor(rng() * N); primaryDr = 1; primaryDc = 0; }
    else if (startEdge === 1) { row = N - 1; col = Math.floor(rng() * N); primaryDr = -1; primaryDc = 0; }
    else if (startEdge === 2) { row = Math.floor(rng() * N); col = 0; primaryDr = 0; primaryDc = 1; }
    else { row = Math.floor(rng() * N); col = N - 1; primaryDr = 0; primaryDc = -1; }
    const width = 1 + Math.floor(rng() * 2);
    let steps = 0;
    while (steps < N * 3 && row >= 0 && row < N && col >= 0 && col < N) {
      for (let wr = -Math.floor(width / 2); wr <= Math.floor(width / 2); wr++)
        for (let wc = -Math.floor(width / 2); wc <= Math.floor(width / 2); wc++) {
          const nr = row + wr, nc = col + wc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) grid[nr * N + nc] = RIVER;
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
    const cy = Math.floor(rng() * N), cx = Math.floor(rng() * N);
    const radius = Math.floor(N * 0.07) + Math.floor(rng() * Math.floor(N * 0.05)) + 3;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (grid[r * N + c] !== EMPTY) continue;
      const dist = Math.sqrt((r - cy) ** 2 + (c - cx) ** 2);
      if (dist + (rng() - 0.5) * radius * 0.7 < radius) grid[r * N + c] = MOUNTAIN;
    }
  }
}

function generateCommercial(grid: Uint8Array, N: number, count: number, compactness: number, rng: () => number): [number, number][] {
  const centers: [number, number][] = [];
  const baseRadius = Math.max(3, Math.floor(N * 0.05));
  for (let k = 0; k < count; k++) {
    let cy = 0, cx = 0, ok = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      cy = 3 + Math.floor(rng() * (N - 6)); cx = 3 + Math.floor(rng() * (N - 6));
      if (grid[cy * N + cx] !== EMPTY) continue;
      if (!centers.some(([cr, cc]) => Math.sqrt((cy - cr) ** 2 + (cx - cc) ** 2) < baseRadius * 3)) { ok = true; break; }
    }
    if (!ok) continue;
    centers.push([cy, cx]);
    const maxR = baseRadius + Math.floor(rng() * 3);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (grid[r * N + c] !== EMPTY) continue;
      const dist = Math.sqrt((r - cy) ** 2 + (c - cx) ** 2);
      const sigma = maxR * compactness;
      if (rng() < Math.exp(-(dist * dist) / (2 * sigma * sigma)) * 1.4) grid[r * N + c] = COMMERCIAL;
    }
  }
  return centers;
}

class MinHeap {
  private d: Float32Array; private id: Int32Array; private sz = 0;
  constructor(cap: number) { this.d = new Float32Array(cap); this.id = new Int32Array(cap); }
  push(cost: number, idx: number) {
    let i = this.sz++; this.d[i] = cost; this.id[i] = idx;
    while (i > 0) { const p = (i - 1) >> 1; if (this.d[p] <= this.d[i]) break; this._sw(p, i); i = p; }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.d[0], this.id[0]];
    const last = --this.sz;
    if (last > 0) { this.d[0] = this.d[last]; this.id[0] = this.id[last]; this._sink(0); }
    return top;
  }
  get empty() { return this.sz === 0; }
  private _sw(a: number, b: number) {
    const t = this.d[a]; this.d[a] = this.d[b]; this.d[b] = t;
    const u = this.id[a]; this.id[a] = this.id[b]; this.id[b] = u;
  }
  private _sink(i: number) {
    while (true) {
      let s = i; const l = 2 * i + 1, r = 2 * i + 2;
      if (l < this.sz && this.d[l] < this.d[s]) s = l;
      if (r < this.sz && this.d[r] < this.d[s]) s = r;
      if (s === i) break; this._sw(s, i); i = s;
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
      if (dir === 1 && nc !== c + 1) continue;
      const ct = grid[ni];
      const cost = (ct === RIVER || ct === MOUNTAIN || ct === BLOCKED) ? 800 : ct === COMMERCIAL ? 4 : ct === ROAD ? 0.3 : 1;
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

function generateRoads(grid: Uint8Array, N: number, centers: [number, number][], roadDensity: number): void {
  const anchors = centers.map(([r, c]) => r * N + c);
  const mid = Math.floor(N / 2);
  anchors.push(mid, (N - 1) * N + mid, mid * N, mid * N + N - 1);
  const valid = anchors.filter(a => { const t = grid[a]; return t === EMPTY || t === COMMERCIAL || t === ROAD; });
  if (valid.length < 2) return;
  const n = valid.length;
  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const ri = Math.floor(valid[i] / N), ci = valid[i] % N;
    const rj = Math.floor(valid[j] / N), cj = valid[j] % N;
    edges.push([Math.abs(ri - rj) + Math.abs(ci - cj), i, j]);
  }
  edges.sort((a, b) => a[0] - b[0]);
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  const mst: [number, number][] = [];
  for (const [, i, j] of edges) {
    const pi = find(i), pj = find(j);
    if (pi !== pj) { parent[pi] = pj; mst.push([valid[i], valid[j]]); if (mst.length === n - 1) break; }
  }
  const extra = Math.floor((roadDensity - 0.5) * n);
  for (let e = 0; e < extra && e < edges.length; e++) {
    const [, i, j] = edges[e + Math.floor(edges.length * 0.3)];
    if (i < valid.length && j < valid.length) mst.push([valid[i], valid[j]]);
  }
  for (const [a, b] of mst) {
    for (const idx of dijkstraPath(N, grid, a, b)) if (grid[idx] === EMPTY) grid[idx] = ROAD;
  }
}

function generateMap(cfg: Config, rng: () => number): { grid: Uint8Array; commercialCenters: [number, number][] } {
  const N = cfg.gridSize;
  const grid = new Uint8Array(N * N);
  generateRivers(grid, N, cfg.riverAmount, rng);
  generateMountains(grid, N, cfg.mountainAmount, rng);
  for (let b = 0; b < cfg.blockedAmount; b++) {
    const w = 3 + Math.floor(rng() * 5), h = 3 + Math.floor(rng() * 5);
    const bx = Math.floor(rng() * Math.max(1, N - w)), by = Math.floor(rng() * Math.max(1, N - h));
    for (let r = by; r < by + h; r++) for (let c = bx; c < bx + w; c++)
      if (r >= 0 && r < N && c >= 0 && c < N && grid[r * N + c] === EMPTY) grid[r * N + c] = BLOCKED;
  }
  const commercialCenters = generateCommercial(grid, N, cfg.commercialCount, cfg.commercialCompactness, rng);
  generateRoads(grid, N, commercialCenters, cfg.roadDensity);
  return { grid, commercialCenters };
}

// ─── Access maps ──────────────────────────────────────────────────────────────
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
        if (dir === 1 && nc !== c + 1) continue;
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
    if (grid[i] === ROAD) roadSrc.push(i);
  }
  const distToCommercial = wmsD(commSrc), distToRoad = wmsD(roadSrc);
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
        if (t === RIVER) riverCnt++;
      }
    }
    housingServiceMap[r * N + c] = Math.max(0.1, 1 + 2 * (mountCnt / area2) + 0.3 * Math.min(1, riverCnt / area2 * 15));
  }
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
        if (t === RIVER) riverCnt++;
        if (t === BLOCKED) blockCnt++;
      }
    }
    neighborhoodQualityMap[r * N + c] = 0.5 * (mountCnt / area3) + 0.3 * Math.min(1, riverCnt / area3 * 12) - 0.6 * (blockCnt / area3);
  }
  return { distToCommercial, distToRoad, localCommercialDensity, housingServiceMap, neighborhoodQualityMap };
}

// ─── Economic functions ───────────────────────────────────────────────────────
function accessibility(idx: number, maps: AccessMaps, N: number): number {
  const scale = N * 0.12;
  const a = 1 / (1 + (isFinite(maps.distToCommercial[idx]) ? maps.distToCommercial[idx] : N) / scale);
  const b = 1 / (1 + (isFinite(maps.distToRoad[idx]) ? maps.distToRoad[idx] : N) / (scale * 0.5));
  return 0.4 * a + 0.3 * b + 0.3 * Math.min(1, maps.localCommercialDensity[idx] * 25);
}

function ageIncomeFactor(age: number, maxAge: number): number {
  if (age < 18) return 0.2;
  if (age < 45) return 0.2 + 0.8 * (age - 18) / 27;
  if (age < 60) return 1.0;
  return Math.max(0.1, 1.0 - 0.5 * (age - 60) / Math.max(1, maxAge - 60));
}

function computeIncome(h: Household, acc: number, cfg: Config, noise: number): number {
  return Math.max(0, cfg.baseIncome * (1 + cfg.moneyIqEffect * h.moneyIq) * (1 + cfg.accessibilityIncomeEffect * acc) * ageIncomeFactor(h.age, cfg.maxAge) + noise);
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
  return Math.max(10, cfg.basePrice + cfg.accessibilityPriceEffect * acc + cfg.densityPriceEffect * popDen + cfg.demandPriceEffect * demand);
}

// Standard level-payment amortization: Pay = P · m(1+m)^N / ((1+m)^N - 1)
function installmentPayment(price: number, N: number, m: number): number {
  if (N <= 0) return price;
  if (m === 0) return price / N;
  const factor = Math.pow(1 + m, N);
  return price * (m * factor) / (factor - 1);
}

// Per-step housing payment given current tenure
function housingPayment(h: Household, price: number, cfg: Config): number {
  if (h.tenureType === "outright") return cfg.maintenanceRate * Math.max(0, h.housingOwnedValue);
  if (h.tenureType === "mortgage") return h.debtPayment;
  return cfg.rentFactor * price; // renter
}

// C_h = C_basic + φ · max(0, Y_h − Pay_h − T_h − C_basic)
function computeConsumption(income: number, pay: number, commuteCost: number, cfg: Config): number {
  const surplus = income - pay - commuteCost - cfg.basicCost;
  return cfg.basicCost + cfg.consumptionPhi * Math.max(0, surplus);
}

// Determine what tenure a household would take at a given price (simulating without side effects)
type CandidateTenure = {
  tenure: TenureType; pay: number;
  newDebt: number; newDebtRate: number; newDebtPayment: number; newHV: number;
};

function decideTenure(h: Household, price: number, commuteCost: number, cfg: Config): CandidateTenure {
  const mortPay = installmentPayment(price, cfg.installmentN, cfg.installmentM);
  // Simulate selling old home first → released equity
  const releasedEquity = h.tenureType !== "renter" ? Math.max(0, h.housingOwnedValue - h.debtPrincipal) : 0;
  const projLiquid = h.liquidWealth + releasedEquity;

  if (projLiquid >= price) {
    return { tenure: "outright", pay: cfg.maintenanceRate * price, newDebt: 0, newDebtRate: 0, newDebtPayment: 0, newHV: price };
  }
  if ((mortPay + commuteCost + cfg.basicCost) <= cfg.affordabilityKappa * h.income) {
    return { tenure: "mortgage", pay: mortPay, newDebt: price, newDebtRate: cfg.installmentM, newDebtPayment: mortPay, newHV: price };
  }
  // Renter: keep existing consumer debt
  return { tenure: "renter", pay: cfg.rentFactor * price, newDebt: h.debtPrincipal, newDebtRate: h.debtRate, newDebtPayment: h.debtPayment, newHV: 0 };
}

// Schelling group composition fit
function computeGroupFit(idx: number, hGroup: number, grid: Uint8Array, households: Map<number, Household>, N: number, tolerance: number): number {
  const r = Math.floor(idx / N), c = idx % N;
  let same = 0, occ = 0;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) { occ++; const nh = households.get(ni); if (nh && nh.group === hGroup) same++; }
    }
  }
  return (occ === 0 ? 0.5 : same / occ) - tolerance;
}

function computeSocialFit(idx: number, h: Household, grid: Uint8Array, households: Map<number, Household>, N: number): number {
  const r = Math.floor(idx / N), c = idx % N;
  let similar = 0, occ = 0;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) {
        occ++;
        const nh = households.get(ni);
        if (nh && Math.abs(h.income - nh.income) / Math.max(1, Math.abs(h.income) + 1) < 0.35) similar++;
      }
    }
  }
  return occ === 0 ? 0.5 : similar / occ;
}

// Full utility: U = λC·ln(C) + λW·ln(1+W_L) + λH·ln(H) + λA·A + λN·NQ + λS·Q + λG·Γ − λT·T − λD·(Pay/Y) − λArr·A_h
function computeUtility(
  idx: number, h: Household, pay: number,
  C: number, grid: Uint8Array, households: Map<number, Household>,
  N: number, cfg: Config, maps: AccessMaps
): number {
  const acc = accessibility(idx, maps, N);
  const dCom = maps.distToCommercial[idx];
  const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
  const H = maps.housingServiceMap[idx];
  const NQ = maps.neighborhoodQualityMap[idx];
  const SF = computeSocialFit(idx, h, grid, households, N);
  const GF = computeGroupFit(idx, h.group, grid, households, N, cfg.groupTolerance);
  const debtBurden = h.income > 0 ? Math.min(2, pay / h.income) : 2;
  const liquidTerm = Math.log(1 + Math.max(0, h.liquidWealth));
  return (
    cfg.lambdaC * Math.log(Math.max(1e-6, C)) +
    cfg.lambdaW * liquidTerm +
    cfg.lambdaH * Math.log(Math.max(0.01, H)) +
    cfg.lambdaA * acc +
    cfg.lambdaN * NQ +
    cfg.lambdaS * SF +
    cfg.lambdaG * GF -
    cfg.lambdaT * T -
    cfg.lambdaD * debtBurden -
    cfg.lambdaArr * h.arrears
  );
}

// Utility at a candidate location (no side effects), simulating balance sheet
function computeUtilityAtCandidate(
  candIdx: number, h: Household, pay: number, projLiquid: number,
  grid: Uint8Array, households: Map<number, Household>,
  N: number, cfg: Config, maps: AccessMaps
): number {
  const acc = accessibility(candIdx, maps, N);
  const dCom = maps.distToCommercial[candIdx];
  const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
  const commuteCost = cfg.commuteCostFactor * T * h.income;
  const C = computeConsumption(h.income, pay, commuteCost, cfg);
  const H = maps.housingServiceMap[candIdx];
  const NQ = maps.neighborhoodQualityMap[candIdx];
  const SF = computeSocialFit(candIdx, h, grid, households, N);
  const GF = computeGroupFit(candIdx, h.group, grid, households, N, cfg.groupTolerance);
  const debtBurden = h.income > 0 ? Math.min(2, pay / h.income) : 2;
  const liquidTerm = Math.log(1 + Math.max(0, projLiquid));
  const arrearsPenalty = (projLiquid < 0 ? h.arrears + 1 : h.arrears);
  return (
    cfg.lambdaC * Math.log(Math.max(1e-6, C)) +
    cfg.lambdaW * liquidTerm +
    cfg.lambdaH * Math.log(Math.max(0.01, H)) +
    cfg.lambdaA * acc +
    cfg.lambdaN * NQ +
    cfg.lambdaS * SF +
    cfg.lambdaG * GF -
    cfg.lambdaT * T -
    cfg.lambdaD * debtBurden -
    cfg.lambdaArr * arrearsPenalty
  );
}

function movingCost(fromIdx: number, toIdx: number, N: number, cfg: Config): number {
  const fr = Math.floor(fromIdx / N), fc = fromIdx % N;
  const tr = Math.floor(toIdx / N), tc = toIdx % N;
  return cfg.movingCostBase + cfg.movingCostDist * (Math.abs(fr - tr) + Math.abs(fc - tc)) / N;
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
    const initLiquid = Math.max(0, gaussRng(rng) * 60 + 80);
    households.set(idx, {
      group: Math.floor(rng() * Math.max(1, cfg.numGroups)),
      moneyIq: miq, age, deathAge,
      income: cfg.baseIncome * miq,
      savingPropensity: 0.1 + rng() * 0.3,
      utility: 0, satisfaction: 0.5, groupFit: 0,
      liquidWealth: initLiquid, housingOwnedValue: 0,
      debtPrincipal: 0, debtRate: 0, debtPayment: 0,
      tenureType: "renter",
      consumption: cfg.basicCost, arrears: 0, defaultCount: 0,
    });
  }
  return households;
}

// Assign tenure at current location (used at init and tenure-upgrade phase)
function assignTenureAtLocation(h: Household, idx: number, grid: Uint8Array, N: number, cfg: Config, maps: AccessMaps, demandMap: Float32Array): void {
  const acc = accessibility(idx, maps, N);
  const popDen = localPopDensity(idx, grid, N);
  const price = computePrice(acc, popDen, cfg, demandMap[idx]);
  const dCom = maps.distToCommercial[idx];
  const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
  const commuteCost = cfg.commuteCostFactor * T * h.income;
  const ct = decideTenure(h, price, commuteCost, cfg);

  if (ct.tenure === "outright" && h.tenureType === "renter") {
    // Simulate: sell old (none), buy outright
    h.liquidWealth -= price;
    h.housingOwnedValue = price;
    h.tenureType = "outright";
    h.debtPrincipal = 0; h.debtRate = 0; h.debtPayment = 0;
  } else if (ct.tenure === "mortgage" && h.tenureType === "renter") {
    h.housingOwnedValue = price;
    h.tenureType = "mortgage";
    h.debtPrincipal = price; h.debtRate = cfg.installmentM; h.debtPayment = ct.pay;
  }
  // If renter stays renter, no change
}

// ─── Simulation tick ──────────────────────────────────────────────────────────
function simulationTick(
  grid: Uint8Array, households: Map<number, Household>,
  N: number, cfg: Config, maps: AccessMaps,
  rng: () => number, demandMap: Float32Array
): { deaths: number; moves: number; defaults: number } {
  let deaths = 0, moves = 0, defaults = 0;

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
      // Inherited liquid wealth (fraction of net worth)
      const nw = netWorthOf(h);
      h.liquidWealth = cfg.inheritanceRetention * Math.max(0, nw);
      h.housingOwnedValue = 0; h.debtPrincipal = 0; h.debtRate = 0; h.debtPayment = 0;
      h.tenureType = "renter"; h.arrears = 0; h.defaultCount = 0;
      h.age = 0; h.deathAge = Math.max(30, Math.round(cfg.avgDeathAge + gaussRng(rng) * 8));
      h.savingPropensity = 0.1 + rng() * 0.3;
    }
  }

  // Phase 3: Income → consumption → budget constraint → debt dynamics
  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    h.income = computeIncome(h, acc, cfg, gaussRng(rng) * (cfg.baseIncome * 0.04));

    const popDen = localPopDensity(idx, grid, N);
    const price = computePrice(acc, popDen, cfg, demandMap[idx]);

    // Update housing value for owners
    if (h.tenureType !== "renter") h.housingOwnedValue = price;

    // Compute housing payment
    const pay = housingPayment(h, price, cfg);

    // Commute cost
    const dCom = maps.distToCommercial[idx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const commuteCost = cfg.commuteCostFactor * T * h.income;

    // Consumption: C = C_basic + φ · max(0, Y − Pay − T − C_basic)
    const C = computeConsumption(h.income, pay, commuteCost, cfg);
    h.consumption = C;

    // Budget constraint: W_L(t+1) = W_L(t) + Y − C − Pay − T
    h.liquidWealth += h.income - C - pay - commuteCost;

    // Mortgage amortization: D(t+1) = D(t) − (Pay − r·D(t))
    if (h.tenureType === "mortgage" && h.debtPrincipal > 0) {
      const interest = h.debtPrincipal * h.debtRate;
      const principalPaid = Math.max(0, h.debtPayment - interest);
      h.debtPrincipal = Math.max(0, h.debtPrincipal - principalPaid);
      if (h.debtPrincipal < 0.01) {
        h.debtPrincipal = 0; h.debtPayment = 0; h.debtRate = 0;
        h.tenureType = "outright";
      }
    }

    // Consumer debt (non-mortgage) grows at overdraftRate
    if (h.tenureType !== "mortgage" && h.debtPrincipal > 0) {
      h.debtPrincipal *= (1 + cfg.overdraftRate);
    }

    // Negative wealth → overdraft debt conversion
    if (h.liquidWealth < 0) {
      h.debtPrincipal += Math.abs(h.liquidWealth);
      h.liquidWealth = 0;
      h.arrears++;
      h.defaultCount++;
      defaults++;
    } else if (h.arrears > 0) {
      h.arrears = Math.max(0, h.arrears - 1);
    }

    // Update social / group fit
    h.satisfaction = computeSocialFit(idx, h, grid, households, N);
    h.groupFit = computeGroupFit(idx, h.group, grid, households, N, cfg.groupTolerance);
    h.utility = computeUtility(idx, h, pay, C, grid, households, N, cfg, maps);
  }

  // Phase 3.5: Tenure upgrade (renters who have saved enough to buy)
  for (const [idx, h] of households) {
    if (h.tenureType !== "renter") continue;
    const acc = accessibility(idx, maps, N);
    const price = computePrice(acc, localPopDensity(idx, grid, N), cfg, demandMap[idx]);
    const dCom = maps.distToCommercial[idx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const commuteCost = cfg.commuteCostFactor * T * h.income;

    if (h.liquidWealth >= price) {
      h.liquidWealth -= price;
      h.housingOwnedValue = price; h.tenureType = "outright";
      h.debtPrincipal = 0; h.debtRate = 0; h.debtPayment = 0;
    } else {
      const mortPay = installmentPayment(price, cfg.installmentN, cfg.installmentM);
      if ((mortPay + commuteCost + cfg.basicCost) <= cfg.affordabilityKappa * h.income && h.debtPrincipal === 0) {
        h.housingOwnedValue = price; h.tenureType = "mortgage";
        h.debtPrincipal = price; h.debtRate = cfg.installmentM; h.debtPayment = mortPay;
      }
    }
  }

  // Phase 4: Utility-based relocation (full balance-sheet simulation)
  const emptyArr: number[] = [];
  for (let i = 0; i < N * N; i++) if (grid[i] === EMPTY) emptyArr.push(i);
  if (emptyArr.length === 0) return { deaths, moves, defaults };

  type MoveCandidate = { from: number; h: Household; to: number; gain: number };
  const moveQueue: MoveCandidate[] = [];
  const pendingDemand = new Float32Array(N * N);

  for (const [fromIdx, h] of households) {
    const U_stay = h.utility;
    const sampleSize = Math.min(25, emptyArr.length);
    let bestUtil = -Infinity, bestTarget = -1;

    // Release equity from current home (simulated)
    const releasedEquity = h.tenureType !== "renter" ? Math.max(0, h.housingOwnedValue - h.debtPrincipal) : 0;

    for (let s = 0; s < sampleSize; s++) {
      const cand = emptyArr[Math.floor(rng() * emptyArr.length)];
      const candAcc = accessibility(cand, maps, N);
      const candPopDen = localPopDensity(cand, grid, N);
      const candPrice = computePrice(candAcc, candPopDen, cfg, demandMap[cand]);
      const dCom = maps.distToCommercial[cand];
      const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
      const commuteCost = cfg.commuteCostFactor * T * h.income;

      // Simulate tenure at candidate (with equity from selling old home)
      const projLiquid = h.liquidWealth + releasedEquity;
      const mortPay = installmentPayment(candPrice, cfg.installmentN, cfg.installmentM);

      let candPay: number, candProjLiquid: number;
      if (projLiquid >= candPrice) {
        candPay = cfg.maintenanceRate * candPrice;
        candProjLiquid = projLiquid - candPrice + h.income - computeConsumption(h.income, candPay, commuteCost, cfg) - candPay - commuteCost;
      } else if ((mortPay + commuteCost + cfg.basicCost) <= cfg.affordabilityKappa * h.income) {
        candPay = mortPay;
        candProjLiquid = projLiquid + h.income - computeConsumption(h.income, candPay, commuteCost, cfg) - candPay - commuteCost;
      } else {
        candPay = cfg.rentFactor * candPrice;
        // Basic affordability check: renter must cover essentials
        if ((candPay + commuteCost + cfg.basicCost) > cfg.affordabilityKappa * h.income + 0.5 * h.liquidWealth) continue;
        candProjLiquid = projLiquid + h.income - computeConsumption(h.income, candPay, commuteCost, cfg) - candPay - commuteCost;

      }

      // Temporarily mark as occupied for social fit
      grid[cand] = RESIDENTIAL;
      const U_cand = computeUtilityAtCandidate(cand, h, candPay, candProjLiquid, grid, households, N, cfg, maps);
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

  // Update demand map
  let maxPD = 1;
  for (let i = 0; i < pendingDemand.length; i++) if (pendingDemand[i] > maxPD) maxPD = pendingDemand[i];
  for (let i = 0; i < N * N; i++) demandMap[i] = Math.min(1, demandMap[i] + pendingDemand[i] / maxPD);

  // Shuffle move queue to remove ordering bias
  for (let i = moveQueue.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [moveQueue[i], moveQueue[j]] = [moveQueue[j], moveQueue[i]];
  }

  // Execute non-conflicting moves with full balance-sheet update
  const usedFrom = new Set<number>(), usedTo = new Set<number>();
  for (const { from: fromIdx, h, to: targetIdx } of moveQueue) {
    if (usedFrom.has(fromIdx) || usedTo.has(targetIdx)) continue;
    if (grid[targetIdx] !== EMPTY) continue;

    grid[fromIdx] = EMPTY; grid[targetIdx] = RESIDENTIAL;
    households.delete(fromIdx); households.set(targetIdx, h);

    // Release equity from old home
    if (h.tenureType !== "renter") {
      const equity = Math.max(0, h.housingOwnedValue - h.debtPrincipal);
      h.liquidWealth += equity;
      h.housingOwnedValue = 0; h.debtPrincipal = 0; h.debtRate = 0; h.debtPayment = 0;
    }

    // Establish tenure at new location
    const mAcc = accessibility(targetIdx, maps, N);
    const mPrice = computePrice(mAcc, localPopDensity(targetIdx, grid, N), cfg, demandMap[targetIdx]);
    const dCom = maps.distToCommercial[targetIdx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const commuteCost = cfg.commuteCostFactor * T * h.income;
    const mortPay = installmentPayment(mPrice, cfg.installmentN, cfg.installmentM);

    if (h.liquidWealth >= mPrice) {
      h.liquidWealth -= mPrice;
      h.housingOwnedValue = mPrice; h.tenureType = "outright";
      h.debtPrincipal = 0; h.debtRate = 0; h.debtPayment = 0;
    } else if ((mortPay + commuteCost + cfg.basicCost) <= cfg.affordabilityKappa * h.income) {
      h.housingOwnedValue = mPrice; h.tenureType = "mortgage";
      h.debtPrincipal = mPrice; h.debtRate = cfg.installmentM; h.debtPayment = mortPay;
    } else {
      h.tenureType = "renter"; h.housingOwnedValue = 0;
    }

    usedFrom.add(fromIdx); usedTo.add(targetIdx); moves++;
  }

  return { deaths, moves, defaults };
}

// ─── Color helpers ────────────────────────────────────────────────────────────
const GROUP_COLORS: [number, number, number][] = [
  [20, 180, 220], [220, 110, 20], [50, 200, 80], [200, 40, 180],
  [220, 200, 20], [140, 50, 220], [220, 40, 40], [20, 200, 160],
];

function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function getCellColor(
  idx: number, grid: Uint8Array, households: Map<number, Household>, cfg: Config,
  ranges: { maxIncome: number; maxLiquid: number; maxNetWorth: number; maxDebt: number; minUtil: number; maxUtil: number }
): [number, number, number] {
  const ct = grid[idx];
  if (ct === RIVER) return [8, 25, 65];
  if (ct === MOUNTAIN) return [28, 42, 22];
  if (ct === COMMERCIAL) return [55, 35, 110];
  if (ct === ROAD) return [58, 52, 46];
  if (ct === BLOCKED) return [38, 22, 22];
  if (ct === EMPTY) return [18, 18, 18];
  const h = households.get(idx);
  if (!h) return [18, 18, 18];
  switch (cfg.colorMode) {
    case "group": return GROUP_COLORS[h.group % GROUP_COLORS.length];
    case "tenure":
      if (h.tenureType === "outright") return [30, 200, 80];
      if (h.tenureType === "mortgage") return [200, 150, 30];
      return [100, 100, 180]; // renter
    case "debt": {
      const t = Math.min(1, h.debtPrincipal / Math.max(1, ranges.maxDebt));
      return lerpRGB([30, 200, 80], [220, 30, 30], t);
    }
    case "liquidwealth": {
      const t = Math.max(0, Math.min(1, h.liquidWealth / Math.max(1, ranges.maxLiquid)));
      return lerpRGB([50, 10, 90], [220, 170, 30], t);
    }
    case "networth": {
      const nw = netWorthOf(h);
      const t = Math.max(0, Math.min(1, (nw + 50) / Math.max(1, ranges.maxNetWorth + 50)));
      return lerpRGB([40, 10, 80], [30, 220, 180], t);
    }
    case "income": {
      const t = Math.min(1, h.income / Math.max(1, ranges.maxIncome));
      if (t < 0.33) return lerpRGB([10, 20, 70], [0, 180, 180], t / 0.33);
      if (t < 0.67) return lerpRGB([0, 180, 180], [220, 200, 0], (t - 0.33) / 0.34);
      return lerpRGB([220, 200, 0], [220, 40, 20], (t - 0.67) / 0.33);
    }
    case "age": {
      const t = h.age / Math.max(1, cfg.maxAge);
      return t < 0.5 ? lerpRGB([20, 160, 60], [200, 190, 20], t / 0.5) : lerpRGB([200, 190, 20], [200, 30, 20], (t - 0.5) / 0.5);
    }
    case "utility": default: {
      const range = Math.max(0.01, ranges.maxUtil - ranges.minUtil);
      const t = Math.max(0, Math.min(1, (h.utility - ranges.minUtil) / range));
      return t < 0.5 ? lerpRGB([30, 10, 80], [20, 130, 200], t / 0.5) : lerpRGB([20, 130, 200], [30, 220, 100], (t - 0.5) / 0.5);
    }
  }
}

// ─── Spatial segregation (income terciles) ────────────────────────────────────
function computeSegregation(grid: Uint8Array, households: Map<number, Household>, N: number): number {
  if (households.size < 3) return 0;
  const sorted = Array.from(households.values()).map(h => h.income).sort((a, b) => a - b);
  const t1 = sorted[Math.floor(sorted.length / 3)], t2 = sorted[Math.floor(2 * sorted.length / 3)];
  const tercile = (v: number) => v <= t1 ? 0 : v <= t2 ? 1 : 2;
  let total = 0, cnt = 0;
  for (const [idx, h] of households) {
    const myT = tercile(h.income); const r = Math.floor(idx / N), c = idx % N;
    let same = 0, occ = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) { occ++; const nh = households.get(ni); if (nh && tercile(nh.income) === myT) same++; }
    }
    if (occ > 0) { total += same / occ; cnt++; }
  }
  return cnt > 0 ? total / cnt : 0;
}

function computeGroupSeg(grid: Uint8Array, households: Map<number, Household>, N: number): { avg: number; seg: number } {
  let total = 0, cnt = 0;
  for (const [idx, h] of households) {
    const r = Math.floor(idx / N), c = idx % N;
    let same = 0, occ = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const ni = nr * N + nc;
      if (grid[ni] === RESIDENTIAL) { occ++; const nh = households.get(ni); if (nh && nh.group === h.group) same++; }
    }
    if (occ > 0) { total += same / occ; cnt++; }
  }
  const avg = cnt > 0 ? total / cnt : 0.5;
  return { avg, seg: avg };
}

function giniCoeff(vals: number[]): number {
  if (vals.length < 2) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const n = sorted.length, mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * sorted[i];
  return num / (n * n * mean);
}

// ─── Metrics computation ──────────────────────────────────────────────────────
function computeMetrics(
  grid: Uint8Array, households: Map<number, Household>, N: number,
  cfg: Config, maps: AccessMaps, prev: Metrics,
  deaths: number, moves: number, defaults: number, demandMap: Float32Array
): { metrics: Metrics; ranges: { maxIncome: number; maxLiquid: number; maxNetWorth: number; maxDebt: number; minUtil: number; maxUtil: number } } {
  let sumIncome = 0, sumLiquid = 0, sumNW = 0, sumDebt = 0, sumDTI = 0;
  let sumConsumption = 0, sumPay = 0, sumPrice = 0, sumAcc = 0;
  let sumAge = 0, sumUtil = 0, sumArrears = 0;
  let cntRenter = 0, cntMortgage = 0, cntOutright = 0, cntAffordable = 0;
  let maxIncome = 1, maxLiquid = 1, maxNW = 1, maxDebt = 1;
  let minUtil = Infinity, maxUtil = -Infinity;
  const incomes: number[] = [], liquidWealths: number[] = [];
  let sumDistCom = 0, sumDistRoad = 0;

  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    const price = computePrice(acc, localPopDensity(idx, grid, N), cfg, demandMap[idx]);
    const pay = housingPayment(h, price, cfg);
    const dCom = maps.distToCommercial[idx];
    const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
    const nw = netWorthOf(h);

    sumIncome += h.income; sumLiquid += h.liquidWealth; sumNW += nw;
    sumDebt += h.debtPrincipal; sumDTI += h.income > 0 ? h.debtPrincipal / h.income : 0;
    sumConsumption += h.consumption; sumPay += pay; sumPrice += price; sumAcc += acc;
    sumAge += h.age; sumUtil += h.utility; sumArrears += h.arrears;
    sumDistCom += isFinite(dCom) ? dCom : N;
    sumDistRoad += isFinite(maps.distToRoad[idx]) ? maps.distToRoad[idx] : N;

    if (h.tenureType === "renter") cntRenter++;
    else if (h.tenureType === "mortgage") cntMortgage++;
    else cntOutright++;

    // Affordable = basic payments fit within kappa*Y + 0.3*liquidWealth
    const budget = cfg.affordabilityKappa * h.income + 0.3 * h.liquidWealth;
    if ((pay + cfg.commuteCostFactor * T * h.income + cfg.basicCost) <= budget) cntAffordable++;

    if (h.income > maxIncome) maxIncome = h.income;
    if (h.liquidWealth > maxLiquid) maxLiquid = h.liquidWealth;
    if (nw > maxNW) maxNW = nw;
    if (h.debtPrincipal > maxDebt) maxDebt = h.debtPrincipal;
    if (h.utility > maxUtil) maxUtil = h.utility;
    if (h.utility < minUtil) minUtil = h.utility;
    incomes.push(h.income); liquidWealths.push(h.liquidWealth);
  }

  const n = Math.max(1, households.size);
  const push = (arr: number[], v: number) => { const next = [...arr, v]; return next.length > MAX_HIST ? next.slice(next.length - MAX_HIST) : next; };

  return {
    metrics: {
      step: prev.step + 1, householdCount: households.size,
      avgIncome: sumIncome / n, avgLiquidWealth: sumLiquid / n, avgNetWorth: sumNW / n,
      avgDebtPrincipal: sumDebt / n, avgDebtToIncome: sumDTI / n,
      avgConsumption: sumConsumption / n, avgHousingPayment: sumPay / n,
      avgLocalPrice: sumPrice / n, avgAccessibility: sumAcc / n,
      avgDistCommercial: sumDistCom / n, avgDistRoad: sumDistRoad / n,
      pctRenter: (cntRenter / n) * 100, pctMortgage: (cntMortgage / n) * 100, pctOutright: (cntOutright / n) * 100,
      avgArrears: sumArrears / n, defaultsThisStep: defaults, totalDefaults: prev.totalDefaults + defaults,
      pctAffordable: (cntAffordable / n) * 100,
      avgAge: sumAge / n, deathsThisStep: deaths, totalDeaths: prev.totalDeaths + deaths,
      avgUtility: sumUtil / n,
      incomeGini: giniCoeff(incomes), wealthGini: giniCoeff(liquidWealths.map(v => Math.max(0, v))),
      spatialSegregation: computeSegregation(grid, households, N),
      movesThisStep: moves,
      avgSameGroupExposure: computeGroupSeg(grid, households, N).avg,
      groupSegIndex: computeGroupSeg(grid, households, N).seg,
      avgIncomeHistory: push(prev.avgIncomeHistory, sumIncome / n),
      avgLiquidWealthHistory: push(prev.avgLiquidWealthHistory, sumLiquid / n),
      avgNetWorthHistory: push(prev.avgNetWorthHistory, sumNW / n),
      avgDebtHistory: push(prev.avgDebtHistory, sumDebt / n),
      avgDebtToIncomeHistory: push(prev.avgDebtToIncomeHistory, (sumDTI / n) * 100),
      avgUtilityHistory: push(prev.avgUtilityHistory, sumUtil / n),
      avgConsumptionHistory: push(prev.avgConsumptionHistory, sumConsumption / n),
      pctMoveHistory: push(prev.pctMoveHistory, (moves / n) * 100),
      incomeGiniHistory: push(prev.incomeGiniHistory, giniCoeff(incomes) * 100),
      wealthGiniHistory: push(prev.wealthGiniHistory, giniCoeff(liquidWealths.map(v => Math.max(0, v))) * 100),
      spatialSegHistory: push(prev.spatialSegHistory, computeSegregation(grid, households, N) * 100),
      avgPriceHistory: push(prev.avgPriceHistory, sumPrice / n),
      deathsHistory: push(prev.deathsHistory, deaths),
      accessibilityHistory: push(prev.accessibilityHistory, (sumAcc / n) * 100),
      avgSameGroupHistory: push(prev.avgSameGroupHistory, computeGroupSeg(grid, households, N).avg * 100),
      groupSegHistory2: push(prev.groupSegHistory2, computeGroupSeg(grid, households, N).seg * 100),
      pctRenterHistory: push(prev.pctRenterHistory, (cntRenter / n) * 100),
      pctMortgageHistory: push(prev.pctMortgageHistory, (cntMortgage / n) * 100),
      pctOutrightHistory: push(prev.pctOutrightHistory, (cntOutright / n) * 100),
      avgArrearsHistory: push(prev.avgArrearsHistory, sumArrears / n),
      defaultsHistory: push(prev.defaultsHistory, defaults),
      avgAgeHistory: push(prev.avgAgeHistory, sumAge / n),
    },
    ranges: { maxIncome, maxLiquid, maxNetWorth: maxNW, maxDebt, minUtil: isFinite(minUtil) ? minUtil : 0, maxUtil: isFinite(maxUtil) ? maxUtil : 2 },
  };
}

function emptyMetrics(): Metrics {
  const h: number[] = [];
  return {
    step: 0, householdCount: 0, avgIncome: 0, avgLiquidWealth: 0, avgNetWorth: 0,
    avgDebtPrincipal: 0, avgDebtToIncome: 0, avgConsumption: 0, avgHousingPayment: 0,
    avgLocalPrice: 0, avgAccessibility: 0, avgDistCommercial: 0, avgDistRoad: 0,
    pctRenter: 0, pctMortgage: 0, pctOutright: 0,
    avgArrears: 0, defaultsThisStep: 0, totalDefaults: 0, pctAffordable: 0,
    avgAge: 0, deathsThisStep: 0, totalDeaths: 0, avgUtility: 0,
    incomeGini: 0, wealthGini: 0, spatialSegregation: 0, movesThisStep: 0,
    avgSameGroupExposure: 0.5, groupSegIndex: 0.5,
    avgIncomeHistory: h, avgLiquidWealthHistory: h, avgNetWorthHistory: h,
    avgDebtHistory: h, avgDebtToIncomeHistory: h, avgUtilityHistory: h,
    avgConsumptionHistory: h, pctMoveHistory: h, incomeGiniHistory: h,
    wealthGiniHistory: h, spatialSegHistory: h, avgPriceHistory: h,
    deathsHistory: h, accessibilityHistory: h, avgSameGroupHistory: h,
    groupSegHistory2: h, pctRenterHistory: h, pctMortgageHistory: h,
    pctOutrightHistory: h, avgArrearsHistory: h, defaultsHistory: h, avgAgeHistory: h,
  };
}

// ─── VizData ──────────────────────────────────────────────────────────────────
function emptyVizData(): VizData {
  return { liquidWealthDist: [], netWorthDist: [], incomeDist: [], debtDist: [], consumptionDist: [], utilityDist: [], scatterData: [] };
}

function makeDist(arr: number[], bins: number): { bin: string; count: number }[] {
  const lo = arr.length ? Math.min(...arr) : 0;
  const hi = arr.length ? Math.max(...arr) : 1;
  const range = hi - lo || 1;
  const result = Array.from({ length: bins }, (_, b) => ({
    bin: `${(lo + b * range / bins).toFixed(0)}`,
    count: 0,
  }));
  for (const v of arr) result[Math.min(bins - 1, Math.floor(((v - lo) / range) * bins))].count++;
  return result;
}

function computeVizData(grid: Uint8Array, households: Map<number, Household>, N: number, cfg: Config, maps: AccessMaps, demandMap: Float32Array): VizData {
  const liquidArr: number[] = [], nwArr: number[] = [], incomeArr: number[] = [];
  const debtArr: number[] = [], consArr: number[] = [], utilArr: number[] = [];
  const scatter: VizData["scatterData"] = [];
  let i = 0;
  for (const [idx, h] of households) {
    const acc = accessibility(idx, maps, N);
    const nw = netWorthOf(h);
    liquidArr.push(h.liquidWealth); nwArr.push(nw); incomeArr.push(h.income);
    debtArr.push(h.debtPrincipal); consArr.push(h.consumption); utilArr.push(h.utility);
    if (i % 3 === 0 && scatter.length < 400) {
      const price = computePrice(acc, localPopDensity(idx, grid, N), cfg, demandMap[idx]);
      scatter.push({ age: h.age, income: h.income, acc, utility: h.utility, liquidWealth: h.liquidWealth, netWorth: nw, debt: h.debtPrincipal, consumption: h.consumption });
      void price;
    }
    i++;
  }
  return {
    liquidWealthDist: makeDist(liquidArr, 20),
    netWorthDist: makeDist(nwArr, 20),
    incomeDist: makeDist(incomeArr, 20),
    debtDist: makeDist(debtArr.filter(v => v > 0), 20),
    consumptionDist: makeDist(consArr, 20),
    utilityDist: makeDist(utilArr, 20),
    scatterData: scatter,
  };
}

// Compute wealth deciles for analytics panel
function computeDeciles(households: Map<number, Household>): { d: string; income: number; liquid: number; debt: number; netWorth: number; count: number }[] {
  const arr = Array.from(households.values()).map(h => ({ nw: netWorthOf(h), income: h.income, liquid: h.liquidWealth, debt: h.debtPrincipal }));
  arr.sort((a, b) => a.nw - b.nw);
  const deciles = [];
  const chunk = Math.max(1, Math.floor(arr.length / 10));
  for (let d = 0; d < 10; d++) {
    const slice = arr.slice(d * chunk, (d + 1) * chunk);
    const cnt = slice.length;
    if (cnt === 0) continue;
    deciles.push({
      d: `D${d + 1}`,
      income: slice.reduce((s, v) => s + v.income, 0) / cnt,
      liquid: slice.reduce((s, v) => s + v.liquid, 0) / cnt,
      debt: slice.reduce((s, v) => s + v.debt, 0) / cnt,
      netWorth: slice.reduce((s, v) => s + v.nw, 0) / cnt,
      count: cnt,
    });
  }
  return deciles;
}

// ─── Canvas time-series chart ─────────────────────────────────────────────────
// Lightweight LTTB downsampling
function lttb(data: number[], threshold: number): number[] {
  if (data.length <= threshold) return data;
  const sampled: number[] = [data[0]];
  const bucketSize = (data.length - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const rStart = Math.floor((i + 1) * bucketSize) + 1;
    const rEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);
    let avgX = 0, avgY = 0, cnt = 0;
    for (let j = rStart; j < rEnd; j++) { avgX += j; avgY += data[j]; cnt++; }
    avgX /= cnt; avgY /= cnt;
    let maxArea = -1, nextA = rStart;
    for (let j = rStart; j < rEnd; j++) {
      const area = Math.abs((a - avgX) * (data[j] - data[a]) - (a - j) * (avgY - data[a]));
      if (area > maxArea) { maxArea = area; nextA = j; }
    }
    sampled.push(data[nextA]); a = nextA;
  }
  sampled.push(data[data.length - 1]);
  return sampled;
}

const CanvasLineChart = memo(function CanvasLineChart({
  series, height, label,
}: {
  series: { data: number[]; color: string; name: string }[];
  height: number; label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);
    if (!series.length || !series[0].data.length) return;

    const THRESHOLD = 150;
    const downsampled = series.map(s => ({ ...s, data: lttb(s.data, THRESHOLD) }));
    const len = downsampled[0].data.length;
    const PL = 44, PR = 8, PT = 14, PB = 14;
    const pW = W - PL - PR, pH = H - PT - PB;

    let yMin = Infinity, yMax = -Infinity;
    for (const s of downsampled) for (const v of s.data) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
    const yRange = yMax - yMin || 1;

    // Grid
    ctx.strokeStyle = "#181818"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PT + (pH * i / 4);
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
      const val = yMax - (yRange * i / 4);
      ctx.fillStyle = "#3a3a3a"; ctx.font = "7px monospace"; ctx.textAlign = "right";
      ctx.fillText(Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(2), PL - 2, y + 3);
    }

    // Lines
    for (const s of downsampled) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1;
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = PL + (len > 1 ? (i / (len - 1)) : 0) * pW;
        const y = PT + pH - ((v - yMin) / yRange) * pH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Label + legend
    ctx.fillStyle = "#333"; ctx.font = "7px monospace"; ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), PL, 9);
    let lx = W - PR;
    for (let i = downsampled.length - 1; i >= 0; i--) {
      const s = downsampled[i]; const last = s.data[s.data.length - 1];
      const txt = `${s.name}:${Math.abs(last) >= 10 ? last.toFixed(1) : last.toFixed(2)}`;
      ctx.fillStyle = s.color; ctx.font = "7px monospace"; ctx.textAlign = "right";
      ctx.fillText(txt, lx, 9);
      lx -= ctx.measureText(txt).width + 10;
    }
  }, [series, label]);

  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <canvas ref={ref} width={480} height={height} style={{ width: "100%", display: "block" }} />
    </div>
  );
});

// ─── Distribution chart ───────────────────────────────────────────────────────
const DistributionChart = memo(function DistributionChart({ data, label, color }: {
  data: { bin: string; count: number }[]; label: string; color: string;
}) {
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[7px] text-[#333] uppercase tracking-widest px-2 pt-1.5 pb-0">{label}</div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data} margin={{ top: 2, right: 6, left: 0, bottom: 16 }} barCategoryGap="4%">
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" vertical={false} />
          <XAxis dataKey="bin" tick={{ fill: "#333", fontSize: 6 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" interval={3} />
          <YAxis tick={{ fill: "#333", fontSize: 6 }} tickLine={false} axisLine={false} width={24} />
          <Tooltip formatter={(v: number) => [v, "n"]} contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 8 }} itemStyle={{ color }} cursor={{ fill: "#ffffff06" }} />
          <Bar dataKey="count" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── Scatter plot ─────────────────────────────────────────────────────────────
type ScatterPoint = { age: number; income: number; acc: number; utility: number; liquidWealth: number; netWorth: number; debt: number; consumption: number };
const ScatterPlot = memo(function ScatterPlot({ data, xKey, yKey, xLabel, yLabel, color }: {
  data: ScatterPoint[]; xKey: keyof ScatterPoint; yKey: keyof ScatterPoint; xLabel: string; yLabel: string; color: string;
}) {
  const xVals = data.map(d => d[xKey]), yVals = data.map(d => d[yKey]);
  const xMin = xVals.length ? Math.min(...xVals) : 0, xMax = xVals.length ? Math.max(...xVals) : 1;
  const yMin = yVals.length ? Math.min(...yVals) : 0, yMax = yVals.length ? Math.max(...yVals) : 1;
  const xPad = (xMax - xMin) * 0.05 || 0.5, yPad = (yMax - yMin) * 0.05 || 0.5;
  const fmt = (v: number) => Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  return (
    <div className="border border-[#181818] bg-[#0a0a0a]">
      <div className="text-[7px] text-[#333] uppercase tracking-widest px-2 pt-1.5 pb-0">{xLabel} <span className="text-[#222]">vs</span> {yLabel}</div>
      <ResponsiveContainer width="100%" height={130}>
        <ScatterChart margin={{ top: 4, right: 10, left: 0, bottom: 14 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="#181818" />
          <XAxis dataKey={xKey} type="number" name={xLabel} domain={[+(xMin - xPad).toFixed(2), +(xMax + xPad).toFixed(2)]} tickCount={4}
            tick={{ fill: "#333", fontSize: 7 }} tickLine={false} axisLine={false} tickFormatter={fmt}
            label={{ value: xLabel, position: "insideBottom", fill: "#444", fontSize: 7, offset: -4 }} />
          <YAxis dataKey={yKey} type="number" name={yLabel} domain={[+(yMin - yPad).toFixed(2), +(yMax + yPad).toFixed(2)]} tickCount={4}
            tick={{ fill: "#333", fontSize: 7 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={36} />
          <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #222", fontSize: 8 }} itemStyle={{ color: "#aaa" }} formatter={(v: number) => v.toFixed(2)} cursor={{ stroke: "#333", strokeWidth: 1 }} />
          <Scatter data={data} fill={color} opacity={0.3} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});

// ─── KPI block ────────────────────────────────────────────────────────────────
function KpiBlock({ label, value, sub, color = "#c8c8c8" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-between px-2 py-1 bg-[#0d0d0d] border border-[#1a1a1a]" style={{ minWidth: 0 }}>
      <div className="text-[7px] font-medium text-[#444] uppercase tracking-wider truncate">{label}</div>
      <div className="text-[12px] font-mono font-bold leading-tight mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[7px] text-[#333] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ─── Inspector panel ──────────────────────────────────────────────────────────
function InspectorPanel({ household, idx, N }: { household: Household | null; idx: number; N: number }) {
  if (!household) {
    return <div className="text-[9px] text-[#333] p-3">Click an agent on the map to inspect.</div>;
  }
  const h = household;
  const nw = netWorthOf(h);
  const r = Math.floor(idx / N), c = idx % N;
  const rows: [string, string, string][] = [
    ["Position", `(${r}, ${c})`, "grid cell"],
    ["Group", `G${h.group}`, "Schelling"],
    ["Age", `${h.age}`, `death at ${h.deathAge}`],
    ["MoneyIQ", h.moneyIq.toFixed(3), "ability"],
    ["─── Income ───", "", ""],
    ["Income Y", h.income.toFixed(2), "per step"],
    ["─── Balance Sheet ───", "", ""],
    ["Liquid W_L", h.liquidWealth.toFixed(2), "cash/liquid"],
    ["Housing H_V", h.housingOwnedValue.toFixed(2), "market value"],
    ["Debt D", h.debtPrincipal.toFixed(2), h.debtRate > 0 ? `r=${(h.debtRate * 100).toFixed(2)}%` : "—"],
    ["Debt Pay", h.debtPayment.toFixed(2), "per step"],
    ["Net Worth", nw.toFixed(2), "W_L + H_V − D"],
    ["Tenure", h.tenureType, ""],
    ["─── Budget ───", "", ""],
    ["Consumption C", h.consumption.toFixed(2), "per step"],
    ["Arrears A", h.arrears.toString(), h.defaultCount > 0 ? `${h.defaultCount} defaults` : "none"],
    ["─── Welfare ───", "", ""],
    ["Utility U", h.utility.toFixed(4), ""],
    ["Social fit", h.satisfaction.toFixed(3), "income-band"],
    ["Group fit Γ", h.groupFit.toFixed(3), `τ=${DEFAULT_CONFIG.groupTolerance}`],
  ];
  return (
    <div className="font-mono text-[9px] px-2 py-2">
      <div className="text-[8px] text-[#444] uppercase tracking-wider mb-2">Agent Inspector — cell {idx}</div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([label, value, note], i) => (
            label.startsWith("─") ? (
              <tr key={i}><td colSpan={3} className="text-[7px] text-[#333] pt-2 pb-0.5 border-b border-[#1a1a1a]">{label}</td></tr>
            ) : (
              <tr key={i} className="border-b border-[#111]">
                <td className="py-0.5 pr-2 text-[#444] w-28">{label}</td>
                <td className="py-0.5 pr-2 text-[#d0d0d0] text-right font-bold">{value}</td>
                <td className="py-0.5 text-[#333] text-[8px]">{note}</td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Analytics panel ──────────────────────────────────────────────────────────
function AnalyticsPanel({ metrics, households }: { metrics: Metrics; households: Map<number, Household> }) {
  const deciles = useMemo(() => computeDeciles(households), [households]);
  const m = metrics;
  return (
    <div className="text-[9px] font-mono px-2 py-2 space-y-3">
      {/* Tenure distribution */}
      <div>
        <div className="text-[7px] text-[#444] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-0.5">Tenure Distribution</div>
        <div className="grid grid-cols-3 gap-px bg-[#151515]">
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Renters</div><div className="text-[#6688cc] font-bold text-[12px]">{m.pctRenter.toFixed(1)}%</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Mortgage</div><div className="text-[#cc8800] font-bold text-[12px]">{m.pctMortgage.toFixed(1)}%</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Outright</div><div className="text-[#30cc80] font-bold text-[12px]">{m.pctOutright.toFixed(1)}%</div></div>
        </div>
      </div>
      {/* Default tracking */}
      <div>
        <div className="text-[7px] text-[#444] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-0.5">Debt & Default</div>
        <div className="grid grid-cols-2 gap-px bg-[#151515]">
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Avg Arrears</div><div className="text-[#cc4444] font-bold">{m.avgArrears.toFixed(2)}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Total Defaults</div><div className="text-[#cc4444] font-bold">{m.totalDefaults}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Avg Debt</div><div className="text-[#cc6600] font-bold">{m.avgDebtPrincipal.toFixed(1)}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Avg D/I ×100</div><div className="text-[#cc6600] font-bold">{(m.avgDebtToIncome * 100).toFixed(1)}</div></div>
        </div>
      </div>
      {/* Net-worth deciles */}
      <div>
        <div className="text-[7px] text-[#444] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-0.5">Net Worth Deciles</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[7px] text-[#333]">
              <th className="text-left pb-0.5 pr-1">D</th>
              <th className="text-right pb-0.5 pr-1">Income</th>
              <th className="text-right pb-0.5 pr-1">Liquid</th>
              <th className="text-right pb-0.5 pr-1">Debt</th>
              <th className="text-right pb-0.5">NW</th>
            </tr>
          </thead>
          <tbody>
            {deciles.map(d => (
              <tr key={d.d} className="border-b border-[#111]">
                <td className="py-0.5 pr-1 text-[#444]">{d.d}</td>
                <td className="py-0.5 pr-1 text-right text-[#22cccc]">{d.income.toFixed(0)}</td>
                <td className="py-0.5 pr-1 text-right text-[#aa88ee]">{d.liquid.toFixed(0)}</td>
                <td className="py-0.5 pr-1 text-right text-[#cc6600]">{d.debt.toFixed(0)}</td>
                <td className="py-0.5 text-right text-[#30dd88]">{d.netWorth.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Inequality */}
      <div>
        <div className="text-[7px] text-[#444] uppercase tracking-wider mb-1 border-b border-[#1a1a1a] pb-0.5">Inequality</div>
        <div className="grid grid-cols-2 gap-px bg-[#151515]">
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Income Gini</div><div className={`font-bold ${m.incomeGini > 0.4 ? "text-[#cc2222]" : "#888"}`}>{m.incomeGini.toFixed(3)}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Wealth Gini</div><div className={`font-bold ${m.wealthGini > 0.4 ? "text-[#cc2222]" : "text-[#888]"}`}>{m.wealthGini.toFixed(3)}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Spatial Seg.</div><div className="text-[#888] font-bold">{m.spatialSegregation.toFixed(3)}</div></div>
          <div className="bg-[#0d0d0d] p-1.5"><div className="text-[#555] text-[7px]">Group Seg.</div><div className="text-[#9966cc] font-bold">{m.groupSegIndex.toFixed(3)}</div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type Tab = "kpi" | "series" | "distributions" | "scatter" | "analytics" | "inspector";

export default function Simulation2() {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics());
  const [vizData, setVizData] = useState<VizData>(emptyVizData());
  const [running, setRunning] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("kpi");
  const [inspectedCell, setInspectedCell] = useState<{ idx: number; h: Household } | null>(null);
  const [perfStats, setPerfStats] = useState({ stepMs: 0, renderMs: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Uint8Array>(new Uint8Array(0));
  const householdsRef = useRef<Map<number, Household>>(new Map());
  const accessMapsRef = useRef<AccessMaps | null>(null);
  const metricsRef = useRef<Metrics>(emptyMetrics());
  const rangesRef = useRef({ maxIncome: 1, maxLiquid: 1, maxNetWorth: 1, maxDebt: 1, minUtil: 0, maxUtil: 2 });
  const rngRef = useRef<(() => number)>(makeRng(DEFAULT_CONFIG.seed));
  const runningRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastStepTimeRef = useRef<number>(0);
  const imageDataRef = useRef<ImageData | null>(null);
  const displayColorsRef = useRef<Float32Array>(new Float32Array(0));
  const cfgRef = useRef<Config>(DEFAULT_CONFIG);
  const demandMapRef = useRef<Float32Array>(new Float32Array(0));

  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  // ─── Init ────────────────────────────────────────────────────────────────
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

      // Prime households with correct income + initial tenure
      for (const [idx, h] of households) {
        const acc = accessibility(idx, maps, N);
        h.income = computeIncome(h, acc, config, 0);
        assignTenureAtLocation(h, idx, grid, N, config, maps, dummyDemand);
        h.satisfaction = computeSocialFit(idx, h, grid, households, N);
        const pay = housingPayment(h, computePrice(acc, localPopDensity(idx, grid, N), config, 0), config);
        const dCom = maps.distToCommercial[idx];
        const T = isFinite(dCom) ? Math.min(1, dCom / N) : 1;
        const commuteCost = config.commuteCostFactor * T * h.income;
        const C = computeConsumption(h.income, pay, commuteCost, config);
        h.consumption = C;
        h.utility = computeUtility(idx, h, pay, C, grid, households, N, config, maps);
      }

      gridRef.current = grid;
      householdsRef.current = households;
      accessMapsRef.current = maps;
      displayColorsRef.current = new Float32Array(N * N * 3).fill(18);
      demandMapRef.current = dummyDemand;

      const { metrics: initM, ranges: initR } = computeMetrics(grid, households, N, config, maps, emptyMetrics(), 0, 0, 0, dummyDemand);
      initM.step = 0;
      metricsRef.current = initM;
      rangesRef.current = initR;
      setMetrics({ ...initM });
      setVizData(computeVizData(grid, households, N, config, maps, dummyDemand));
      setInspectedCell(null);
      setGenerating(false);
    }, 10);
  }, []);

  useEffect(() => { initSim(DEFAULT_CONFIG); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Canvas render ────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    const t0 = performance.now();
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
      dc[base] += (tr - dc[base]) * LERP_FACTOR;
      dc[base + 1] += (tg - dc[base + 1]) * LERP_FACTOR;
      dc[base + 2] += (tb - dc[base + 2]) * LERP_FACTOR;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cs = CANVAS_SIZE / N;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const idx = r * N + c, base = idx * 3;
      ctx.fillStyle = `rgb(${Math.round(dc[base])},${Math.round(dc[base + 1])},${Math.round(dc[base + 2])})`;
      ctx.fillRect(c * cs, r * cs, cs, cs);
    }
    setPerfStats(p => ({ ...p, renderMs: +(performance.now() - t0).toFixed(1) }));
  }, []);

  // ─── Click inspector ──────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);
    const N = cfgRef.current.gridSize;
    const cs = CANVAS_SIZE / N;
    const col = Math.floor(x / cs), row = Math.floor(y / cs);
    const idx = row * N + col;
    const h = householdsRef.current.get(idx);
    if (h) { setInspectedCell({ idx, h: { ...h } }); setActiveTab("inspector"); }
    else setInspectedCell(null);
  }, []);

  // ─── Tick ─────────────────────────────────────────────────────────────────
  const tick = useCallback((timestamp: number) => {
    if (!runningRef.current) return;
    const config = cfgRef.current;
    if (timestamp - lastStepTimeRef.current >= config.speed) {
      lastStepTimeRef.current = timestamp;
      const grid = gridRef.current, households = householdsRef.current, maps = accessMapsRef.current, N = config.gridSize;
      if (grid.length === N * N && maps) {
        const t0 = performance.now();
        const { deaths, moves, defaults } = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
        const { metrics: newM, ranges } = computeMetrics(grid, households, N, config, maps, metricsRef.current, deaths, moves, defaults, demandMapRef.current);
        metricsRef.current = newM; rangesRef.current = ranges;
        setMetrics({ ...newM });
        setPerfStats(p => ({ ...p, stepMs: +(performance.now() - t0).toFixed(1) }));
        if (newM.step % 5 === 0) setVizData(computeVizData(grid, households, N, config, maps, demandMapRef.current));
        if (newM.step >= config.maxSteps) { runningRef.current = false; setRunning(false); return; }
      }
    }
    renderCanvas();
    rafRef.current = requestAnimationFrame(tick);
  }, [renderCanvas]);

  useEffect(() => {
    if (running) { runningRef.current = true; lastStepTimeRef.current = performance.now(); rafRef.current = requestAnimationFrame(tick); }
    else { runningRef.current = false; cancelAnimationFrame(rafRef.current); }
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [running, tick]);

  useEffect(() => {
    if (!running) { const id = requestAnimationFrame(() => renderCanvas()); return () => cancelAnimationFrame(id); }
  }, [running, renderCanvas, metrics]);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const handleStep = useCallback(() => {
    if (running) return;
    const config = cfgRef.current, grid = gridRef.current, households = householdsRef.current, maps = accessMapsRef.current, N = config.gridSize;
    if (grid.length === N * N && maps) {
      const { deaths, moves, defaults } = simulationTick(grid, households, N, config, maps, rngRef.current, demandMapRef.current);
      const { metrics: newM, ranges } = computeMetrics(grid, households, N, config, maps, metricsRef.current, deaths, moves, defaults, demandMapRef.current);
      metricsRef.current = newM; rangesRef.current = ranges;
      setMetrics({ ...newM });
      setVizData(computeVizData(grid, households, N, config, maps, demandMapRef.current));
      renderCanvas();
    }
  }, [running, renderCanvas]);

  const updateCfg = <K extends keyof Config>(key: K, value: Config[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }));
    cfgRef.current = { ...cfgRef.current, [key]: value };
  };

  const Slider = ({ label, k, min, max, step = 1, decimals = 0 }: { label: string; k: keyof Config; min: number; max: number; step?: number; decimals?: number }) => {
    const val = cfg[k] as number;
    const id = `sl-${k}`;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <label htmlFor={id} className="text-[9px] text-[#666]">{label}</label>
          <span className="text-[9px] text-[#999] font-mono">{val.toFixed(decimals)}</span>
        </div>
        <input id={id} type="range" min={min} max={max} step={step} value={val}
          onChange={e => updateCfg(k, parseFloat(e.target.value) as Config[typeof k])}
          className="w-full h-0.5 accent-[#4466aa] cursor-pointer" />
      </div>
    );
  };

  // ─── Chart series (memoized) ───────────────────────────────────────────────
  const incomeSeries = useMemo(() => [
    { data: metrics.avgIncomeHistory, color: "#22cccc", name: "Income" },
    { data: metrics.avgConsumptionHistory, color: "#44bbcc", name: "Consump" },
  ], [metrics.avgIncomeHistory, metrics.avgConsumptionHistory]);

  const wealthSeries = useMemo(() => [
    { data: metrics.avgLiquidWealthHistory, color: "#aa88ee", name: "Liquid" },
    { data: metrics.avgNetWorthHistory, color: "#30dd88", name: "NetWorth" },
  ], [metrics.avgLiquidWealthHistory, metrics.avgNetWorthHistory]);

  const debtSeries = useMemo(() => [
    { data: metrics.avgDebtHistory, color: "#cc6600", name: "Debt" },
    { data: metrics.avgDebtToIncomeHistory, color: "#cc4444", name: "D/I×100" },
  ], [metrics.avgDebtHistory, metrics.avgDebtToIncomeHistory]);

  const utilitySeries = useMemo(() => [
    { data: metrics.avgUtilityHistory, color: "#30dd88", name: "Utility" },
  ], [metrics.avgUtilityHistory]);

  const priceSeries = useMemo(() => [
    { data: metrics.avgPriceHistory, color: "#dd8800", name: "Price" },
    { data: metrics.accessibilityHistory, color: "#5577cc", name: "Access×100" },
  ], [metrics.avgPriceHistory, metrics.accessibilityHistory]);

  const tenureSeries = useMemo(() => [
    { data: metrics.pctRenterHistory, color: "#6688cc", name: "Renter%" },
    { data: metrics.pctMortgageHistory, color: "#cc8800", name: "Mortg%" },
    { data: metrics.pctOutrightHistory, color: "#30cc80", name: "Outright%" },
  ], [metrics.pctRenterHistory, metrics.pctMortgageHistory, metrics.pctOutrightHistory]);

  const inequalitySeries = useMemo(() => [
    { data: metrics.incomeGiniHistory, color: "#cc4444", name: "IncGini×100" },
    { data: metrics.wealthGiniHistory, color: "#cc7700", name: "WlthGini×100" },
  ], [metrics.incomeGiniHistory, metrics.wealthGiniHistory]);

  const defaultsSeries = useMemo(() => [
    { data: metrics.avgArrearsHistory, color: "#cc4444", name: "AvgArrears" },
    { data: metrics.defaultsHistory, color: "#cc2222", name: "Defaults/step" },
  ], [metrics.avgArrearsHistory, metrics.defaultsHistory]);

  const schellingsSeries = useMemo(() => [
    { data: metrics.avgSameGroupHistory, color: "#cc88ff", name: "SameGrp×100" },
    { data: metrics.groupSegHistory2, color: "#9944cc", name: "GroupSeg×100" },
  ], [metrics.avgSameGroupHistory, metrics.groupSegHistory2]);

  const m = metrics;

  // ─── Math equations ────────────────────────────────────────────────────────
  const mathEquations: { title: string; sym: string; num?: string; note: string }[] = [
    {
      title: "Balance sheet",
      sym: String.raw`\text{NetWorth}_h = W_h^L + H_h^V - D_h`,
      num: `\\text{NetWorth}=${m.avgLiquidWealth.toFixed(1)}+${m.avgNetWorth.toFixed(1)}-${m.avgDebtPrincipal.toFixed(1)}\\approx${m.avgNetWorth.toFixed(1)}`,
      note: "W_L: liquid wealth, H_V: housing market value, D: outstanding debt (mortgage + consumer). Avg values shown.",
    },
    {
      title: "Budget constraint",
      sym: String.raw`W_h^L(t+1)=W_h^L(t)+Y_h-C_h-\text{Pay}_h-T_h`,
      num: `=${m.avgLiquidWealth.toFixed(1)}+${m.avgIncome.toFixed(1)}-${m.avgConsumption.toFixed(1)}-${m.avgHousingPayment.toFixed(1)}-\\text{commute}`,
      note: "If W_L < 0: overdraft debt D += |W_L|, W_L = 0, arrears++. Saving = (1−φ)·(Y − Pay − T − C_basic).",
    },
    {
      title: "Consumption function",
      sym: String.raw`C_h = C_{\text{basic}} + \phi \cdot \max(0,\, Y_h - \text{Pay}_h - T_h - C_{\text{basic}})`,
      num: `=${cfg.basicCost.toFixed(0)}+${cfg.consumptionPhi.toFixed(2)}\\cdot\\max(0,\\,Y-\\text{Pay}-T-${cfg.basicCost.toFixed(0)})`,
      note: `φ=${cfg.consumptionPhi.toFixed(2)} is the marginal propensity to consume. Avg consumption: ${m.avgConsumption.toFixed(2)}.`,
    },
    {
      title: "Mortgage payment (level-payment amortization)",
      sym: String.raw`\text{Pay}_h = P \cdot \frac{m(1+m)^N}{(1+m)^N - 1}`,
      num: `=P\\cdot\\frac{${cfg.installmentM.toFixed(3)}(1+${cfg.installmentM.toFixed(3)})^{${cfg.installmentN}}}{(1+${cfg.installmentM.toFixed(3)})^{${cfg.installmentN}}-1}=${installmentPayment(100, cfg.installmentN, cfg.installmentM).toFixed(3)}\\text{ per 100 principal}`,
      note: `N=${cfg.installmentN} steps, m=${cfg.installmentM.toFixed(3)}/step. Avg housing payment: ${m.avgHousingPayment.toFixed(2)}.`,
    },
    {
      title: "Mortgage principal amortization",
      sym: String.raw`D_{t+1} = D_t - \bigl(\text{Pay} - r \cdot D_t\bigr)`,
      num: `D_{t+1}=D_t-\\text{Pay}+${cfg.installmentM.toFixed(3)}\\cdot D_t`,
      note: "Principal reduces each step by payment minus interest. When D ≈ 0, tenure upgrades to outright.",
    },
    {
      title: "Overdraft debt conversion",
      sym: String.raw`\text{if}\; W_h^L < 0 \;\Rightarrow\; D_h \mathrel{+}= |W_h^L|,\quad D_{t+1}=D_t(1+r_{\text{overdraft}})`,
      num: `r_{\\text{overdraft}}=${cfg.overdraftRate.toFixed(3)}/\\text{step}`,
      note: `Consumer debt grows at ${(cfg.overdraftRate * 100).toFixed(1)}% per step. Avg debt: ${m.avgDebtPrincipal.toFixed(1)}.`,
    },
    {
      title: "Tenure decision",
      sym: String.raw`\text{tenure} = \begin{cases} \text{outright} & W_h^L \geq P \\ \text{mortgage} & \text{Pay} + T + C_\text{basic} \leq \kappa Y_h \\ \text{renter} & \text{otherwise} \end{cases}`,
      num: `\\kappa=${cfg.affordabilityKappa.toFixed(2)},\\;\\text{Renter}=${m.pctRenter.toFixed(1)}\\%,\\;\\text{Mortg}=${m.pctMortgage.toFixed(1)}\\%,\\;\\text{Outright}=${m.pctOutright.toFixed(1)}\\%`,
      note: "Evaluated on every relocation AND when a renter's savings reach the purchase threshold.",
    },
    {
      title: "Full utility function",
      sym: String.raw`U_h = \lambda_C\ln C_h + \lambda_W\ln(1+W_h^L) + \lambda_H\ln H + \lambda_A A + \lambda_N NQ + \lambda_S Q + \lambda_G\Gamma - \lambda_T T - \lambda_D\tfrac{\text{Pay}}{Y} - \lambda_A A_h`,
      num: `\\lambda_C=${cfg.lambdaC.toFixed(2)},\\lambda_W=${cfg.lambdaW.toFixed(2)},\\lambda_D=${cfg.lambdaD.toFixed(2)},\\lambda_{\\text{arr}}=${cfg.lambdaArr.toFixed(2)}`,
      note: `λW penalizes low liquid wealth; λD penalizes high debt burden Pay/Y; λArr penalizes arrears count. Avg U=${m.avgUtility.toFixed(3)}.`,
    },
    {
      title: "Market price",
      sym: String.raw`P(x)=P_0+\beta_A A(x)+\beta_D\rho_{\mathrm{pop}}(x)+\beta_{\mathrm{dem}}\,d(x)`,
      num: `=${cfg.basePrice}+${cfg.accessibilityPriceEffect}\\,A(x)+${cfg.densityPriceEffect}\\,\\rho_{\\mathrm{pop}}+${cfg.demandPriceEffect}\\,d(x)`,
      note: `Demand d(x) accumulates from feasible households considering this cell. Avg price: ${m.avgLocalPrice.toFixed(1)}.`,
    },
    {
      title: "Housing service quality",
      sym: String.raw`H(x) = 1 + 2\cdot\mathrm{Green}(x) + 0.3\cdot\mathrm{RiverNear}(x)`,
      note: "Static terrain proxy. Mountain proximity = greenery/quiet. River proximity: moderate positive.",
    },
    {
      title: "Schelling group fit",
      sym: String.raw`\Gamma_h(x) = s_h(x) - \tau_G, \quad s_h(x)=\frac{\#\{j\in\mathcal{N}(x):g_j=g_h\}}{|\mathcal{N}_{\mathrm{occ}}(x)|}`,
      num: `\\tau_G=${cfg.groupTolerance.toFixed(2)},\\;G=${cfg.numGroups},\\;\\text{AvgSameGrp}=${(m.avgSameGroupExposure * 100).toFixed(1)}\\%`,
      note: "Households prefer same-group majority (Γ > 0). Group seg index = avg same-group neighbour share.",
    },
    {
      title: "Move decision",
      sym: String.raw`x_h^\star = \arg\max_{x\in\mathcal{C}_h}\!\bigl[U_h^{\mathrm{BS}}(x) - MC_h(x)\bigr], \quad \text{move iff } U_h^\star > U_h^{\mathrm{stay}} + \tau_U`,
      num: `\\tau_U=${cfg.utilityThreshold.toFixed(3)},\\;MC=\\mu_0+\\mu_1\\frac{\\mathrm{dist}}{N}=${cfg.movingCostBase.toFixed(2)}+${cfg.movingCostDist.toFixed(2)}\\cdot\\frac{\\mathrm{dist}}{N}`,
      note: "U^BS simulates full balance sheet (sell old home, establish new tenure) before computing utility.",
    },
    {
      title: "Income",
      sym: String.raw`Y_h(t) = Y_0\bigl(1+\alpha_M m_h\bigr)\bigl(1+\alpha_A A(x_h)\bigr)\cdot g(a_h)\cdot(1+\varepsilon_h)`,
      num: `Y_0=${cfg.baseIncome},\\;\\alpha_M=${cfg.moneyIqEffect.toFixed(2)},\\;\\alpha_A=${cfg.accessibilityIncomeEffect.toFixed(2)},\\;\\bar{Y}=${m.avgIncome.toFixed(1)}`,
      note: "g(a): age-income profile (rises 18–45, peaks 45–60, declines). ε: Gaussian noise.",
    },
    {
      title: "Inheritance",
      sym: String.raw`W_h^{L,\mathrm{new}} = \rho_W \cdot \max(0,\,\mathrm{NetWorth}_h^{\mathrm{old}}), \quad m_h^{\mathrm{new}} = \eta m_h^{\mathrm{old}} + (1-\eta)\varepsilon`,
      num: `\\rho_W=${cfg.inheritanceRetention.toFixed(2)},\\;\\eta=${cfg.moneyIqPersistence.toFixed(2)}`,
      note: "Net worth (not just wealth) is inherited: child starts with equity from parent's estate. Debt is not transferred.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-[#d4d4d4] font-sans p-3 pb-16">

      {/* Header */}
      <div className="mb-3">
        <div className="text-[10px] text-[#444] mb-1">
          <Link href="/projectx" className="hover:text-[#777] transition-colors">Project X</Link>
          <span className="mx-1">/</span>
          <span className="text-[#666]">Simulation 2</span>
        </div>
        <h1 className="text-lg font-bold text-[#e0e0e0] tracking-tight mb-0.5">Urban Economy — Full Balance-Sheet ABM</h1>
        <p className="text-[10px] text-[#555] max-w-3xl leading-relaxed">
          Households hold a full balance sheet (liquid wealth, housing equity, debt). Consumption is derived from a proper budget constraint. Tenure (renter/mortgage/outright) is determined dynamically. Defaults and arrears are tracked. Utility includes debt burden and liquidity.
        </p>

        {/* Math model panel */}
        <div className="mt-2 border border-[#1c1c1c]">
          <button type="button" onClick={() => setMathOpen(o => !o)}
            className="w-full text-left px-3 py-1.5 text-[10px] text-[#666] hover:text-[#aaa] flex justify-between items-center transition-colors">
            <span className="font-medium">Mathematical Model — Balance-Sheet Economy</span>
            <span className="text-[#444] text-[9px]">{mathOpen ? "collapse ▲" : "expand ▼"}</span>
          </button>
          {mathOpen && (
            <div className="px-4 pb-4 border-t border-[#1a1a1a] overflow-y-auto max-h-[70vh]">
              {mathEquations.map(({ title, sym, num, note }) => (
                <div key={title} className="mt-3 first:mt-2">
                  <div className="text-[9px] font-medium text-[#777] uppercase tracking-wider mb-1">{title}</div>
                  <div className="overflow-x-auto py-1 px-2 bg-[#0d0d0d] border border-[#1e1e1e] text-[#ccc]"
                    dangerouslySetInnerHTML={{ __html: katex.renderToString(sym, { throwOnError: false, displayMode: true }) }} />
                  {num && (
                    <div className="overflow-x-auto py-1 px-2 mt-px bg-[#0a0a0a] border border-[#1a1a1a] text-[#7a9a6a]"
                      dangerouslySetInnerHTML={{ __html: katex.renderToString(num, { throwOnError: false, displayMode: true }) }} />
                  )}
                  <div className="text-[9px] text-[#444] mt-1 leading-relaxed">{note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main layout: map left, analysis right */}
      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: `${CANVAS_SIZE}px 1fr` }}>

        {/* Left: Map + legend */}
        <div className="flex flex-col gap-2">
          <div className="border border-[#1c1c1c] relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
              onClick={handleCanvasClick} className="cursor-crosshair" />
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#080808cc] text-[#555] text-xs">Generating…</div>
            )}
          </div>
          {/* Legend */}
          <div className="border border-[#1c1c1c] px-2 py-1.5">
            <div className="text-[7px] text-[#444] uppercase mb-1">Terrain</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {[
                { color: "rgb(18,18,18)", label: "Empty" }, { color: "rgb(55,35,110)", label: "Commercial" },
                { color: "rgb(58,52,46)", label: "Road" }, { color: "rgb(8,25,65)", label: "River" },
                { color: "rgb(28,42,22)", label: "Mountain" }, { color: "rgb(38,22,22)", label: "Blocked" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-2 h-2 border border-[#2a2a2a]" style={{ backgroundColor: color }} />
                  <span className="text-[8px] text-[#555]">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-[7px] text-[#444] mt-1">Agents colored by selected mode. Click agent to inspect.</div>
          </div>
          {/* Perf diagnostics */}
          <div className="border border-[#1c1c1c] px-2 py-1.5 font-mono text-[8px] text-[#333]">
            <span className="text-[#222] mr-3">PERF</span>
            <span className="mr-3">sim: <span className="text-[#444]">{perfStats.stepMs}ms</span></span>
            <span className="mr-3">render: <span className="text-[#444]">{perfStats.renderMs}ms</span></span>
            <span className="mr-3">agents: <span className="text-[#444]">{m.householdCount}</span></span>
            <span>viz/5t · canvas · lttb(150)</span>
          </div>
        </div>

        {/* Right: tabbed analysis panel */}
        <div className="flex flex-col gap-0 min-w-0">

          {/* Status bar */}
          <div className="flex items-center gap-2 px-2 py-1 border border-[#1a1a1a] bg-[#0d0d0d] mb-px">
            <span className={`text-[8px] font-mono px-1.5 py-0.5 border ${running ? "bg-[#0e2010] border-[#1a4020] text-[#44bb66]" : generating ? "bg-[#1a1020] border-[#2a1538] text-[#9966cc]" : "bg-[#111] border-[#222] text-[#555]"}`}>
              {running ? "● RUN" : generating ? "⟳ GEN" : "■ STOP"}
            </span>
            <span className="text-[9px] font-mono text-[#555]">t={m.step}</span>
            <span className="text-[9px] font-mono text-[#444]">|</span>
            <span className="text-[9px] font-mono text-[#22cccc]">Y̅={m.avgIncome.toFixed(1)}</span>
            <span className="text-[9px] font-mono text-[#aa88ee]">W̅_L={m.avgLiquidWealth.toFixed(1)}</span>
            <span className="text-[9px] font-mono text-[#30dd88]">NW̅={m.avgNetWorth.toFixed(1)}</span>
            <span className="text-[9px] font-mono text-[#cc6600]">D̅={m.avgDebtPrincipal.toFixed(1)}</span>
            <span className="text-[9px] font-mono text-[#cc4444]">def={m.defaultsThisStep}</span>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-[#1a1a1a] mb-px">
            {([
              ["kpi", "KPIs"], ["series", "Time-Series"], ["distributions", "Distributions"],
              ["scatter", "Scatter"], ["analytics", "Analytics"], ["inspector", "Inspector"],
            ] as [Tab, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                className={`px-2.5 py-1 text-[9px] border-r border-[#1a1a1a] transition-colors ${activeTab === id ? "bg-[#141414] text-[#aaa]" : "bg-[#0d0d0d] text-[#444] hover:text-[#777]"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* KPI Tab */}
          {activeTab === "kpi" && (
            <div className="flex flex-col gap-px">
              <div className="grid grid-cols-5 gap-px bg-[#141414]">
                <KpiBlock label="Step"        value={m.step.toLocaleString()}                color="#e0e0e0" />
                <KpiBlock label="Agents"      value={m.householdCount.toLocaleString()}      color="#aaa" />
                <KpiBlock label="Avg Income"  value={m.avgIncome.toFixed(1)}                color="#22cccc" />
                <KpiBlock label="Avg Liquid"  value={m.avgLiquidWealth.toFixed(1)}          color="#aa88ee" sub="W_L" />
                <KpiBlock label="Avg Net Worth" value={m.avgNetWorth.toFixed(1)}            color="#30dd88" sub="NW" />
              </div>
              <div className="grid grid-cols-5 gap-px bg-[#141414] mt-px">
                <KpiBlock label="Avg Debt"    value={m.avgDebtPrincipal.toFixed(1)}         color="#cc6600" sub="D" />
                <KpiBlock label="Debt/Income" value={(m.avgDebtToIncome * 100).toFixed(1)}  color={m.avgDebtToIncome > 3 ? "#cc2222" : "#cc8844"} sub="D/Y×100" />
                <KpiBlock label="Avg Consump" value={m.avgConsumption.toFixed(1)}           color="#44bbcc" sub="C_h" />
                <KpiBlock label="Avg Housing" value={m.avgHousingPayment.toFixed(2)}        color="#dd8800" sub="Pay/step" />
                <KpiBlock label="Avg Price"   value={m.avgLocalPrice.toFixed(1)}            color="#cc7700" sub="P(x)" />
              </div>
              <div className="grid grid-cols-5 gap-px bg-[#141414] mt-px">
                <KpiBlock label="Renter %"   value={m.pctRenter.toFixed(1) + "%"}          color="#6688cc" />
                <KpiBlock label="Mortgage %" value={m.pctMortgage.toFixed(1) + "%"}         color="#cc8800" />
                <KpiBlock label="Outright %" value={m.pctOutright.toFixed(1) + "%"}         color="#30cc80" />
                <KpiBlock label="Affordable" value={m.pctAffordable.toFixed(1) + "%"}       color={m.pctAffordable < 50 ? "#cc2222" : "#55cc77"} />
                <KpiBlock label="Avg Utility" value={m.avgUtility.toFixed(3)}              color="#30dd88" sub="U_h" />
              </div>
              <div className="grid grid-cols-5 gap-px bg-[#141414] mt-px">
                <KpiBlock label="Avg Arrears" value={m.avgArrears.toFixed(2)}              color={m.avgArrears > 1 ? "#cc2222" : "#888"} sub="A_h" />
                <KpiBlock label="Defaults/t"  value={m.defaultsThisStep.toString()}         color={m.defaultsThisStep > 10 ? "#cc2222" : "#666"} sub={`tot:${m.totalDefaults}`} />
                <KpiBlock label="Moves/t"     value={m.movesThisStep.toLocaleString()}      color={m.movesThisStep > 50 ? "#ee6633" : "#888"} sub="utility-driven" />
                <KpiBlock label="Deaths/t"    value={m.deathsThisStep.toString()}           color="#555" sub={`tot:${m.totalDeaths}`} />
                <KpiBlock label="Avg Age"     value={m.avgAge.toFixed(1)}                  color={m.avgAge > 60 ? "#cc4422" : "#44bb77"} />
              </div>
              <div className="grid grid-cols-5 gap-px bg-[#141414] mt-px">
                <KpiBlock label="Income Gini" value={m.incomeGini.toFixed(3)}              color={m.incomeGini > 0.4 ? "#cc2222" : "#999"} />
                <KpiBlock label="Wealth Gini" value={m.wealthGini.toFixed(3)}              color={m.wealthGini > 0.4 ? "#cc2222" : "#999"} />
                <KpiBlock label="Spatial Seg" value={m.spatialSegregation.toFixed(3)}       color={m.spatialSegregation > 0.6 ? "#cc2222" : "#999"} />
                <KpiBlock label="SameGrp Exp" value={(m.avgSameGroupExposure * 100).toFixed(1) + "%"} color={m.avgSameGroupExposure > 0.7 ? "#cc4444" : "#88aadd"} sub="E_same" />
                <KpiBlock label="Access ×100" value={(m.avgAccessibility * 100).toFixed(1)} color="#5577cc" />
              </div>
            </div>
          )}

          {/* Time-Series Tab */}
          {activeTab === "series" && (
            <div className="flex flex-col gap-px">
              <CanvasLineChart series={incomeSeries}     height={80} label="Income · Consumption" />
              <CanvasLineChart series={wealthSeries}     height={80} label="Liquid Wealth · Net Worth" />
              <CanvasLineChart series={debtSeries}       height={80} label="Avg Debt · Debt/Income×100" />
              <CanvasLineChart series={utilitySeries}    height={70} label="Avg Utility" />
              <CanvasLineChart series={priceSeries}      height={70} label="Price · Accessibility×100" />
              <CanvasLineChart series={tenureSeries}     height={70} label="Tenure: Renter / Mortgage / Outright (%)" />
              <CanvasLineChart series={inequalitySeries} height={70} label="Gini: Income · Wealth (×100)" />
              <CanvasLineChart series={defaultsSeries}   height={70} label="Avg Arrears · Defaults/step" />
              <CanvasLineChart series={schellingsSeries} height={70} label="Schelling: Same-group × 100" />
            </div>
          )}

          {/* Distributions Tab */}
          {activeTab === "distributions" && (
            <div className="grid grid-cols-2 gap-px bg-[#141414]">
              <DistributionChart data={vizData.incomeDist}       label="Income"         color="#22cccc" />
              <DistributionChart data={vizData.liquidWealthDist} label="Liquid Wealth"  color="#aa88ee" />
              <DistributionChart data={vizData.netWorthDist}     label="Net Worth"      color="#30dd88" />
              <DistributionChart data={vizData.debtDist}         label="Debt (>0)"      color="#cc6600" />
              <DistributionChart data={vizData.consumptionDist}  label="Consumption"    color="#44bbcc" />
              <DistributionChart data={vizData.utilityDist}      label="Utility"        color="#30dd88" />
            </div>
          )}

          {/* Scatter Tab */}
          {activeTab === "scatter" && (
            <div className="grid grid-cols-2 gap-px bg-[#141414]">
              <ScatterPlot data={vizData.scatterData} xKey="income"      yKey="consumption"  xLabel="Income"       yLabel="Consumption"   color="#44bbcc" />
              <ScatterPlot data={vizData.scatterData} xKey="netWorth"    yKey="utility"      xLabel="Net Worth"    yLabel="Utility"       color="#30dd88" />
              <ScatterPlot data={vizData.scatterData} xKey="debt"        yKey="utility"      xLabel="Debt"         yLabel="Utility"       color="#cc6600" />
              <ScatterPlot data={vizData.scatterData} xKey="age"         yKey="liquidWealth" xLabel="Age"          yLabel="Liquid Wealth" color="#aa88ee" />
              <ScatterPlot data={vizData.scatterData} xKey="income"      yKey="liquidWealth" xLabel="Income"       yLabel="Liquid Wealth" color="#22cccc" />
              <ScatterPlot data={vizData.scatterData} xKey="acc"         yKey="utility"      xLabel="Accessibility" yLabel="Utility"      color="#5577cc" />
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === "analytics" && (
            <AnalyticsPanel metrics={m} households={householdsRef.current} />
          )}

          {/* Inspector Tab */}
          {activeTab === "inspector" && (
            <InspectorPanel household={inspectedCell?.h ?? null} idx={inspectedCell?.idx ?? 0} N={cfg.gridSize} />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-3 border border-[#1a1a1a] p-3">

        {/* Button row */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <button type="button" onClick={() => setRunning(true)} disabled={running || generating}
            className="px-3 py-1 text-[10px] border border-[#2a5a2a] bg-[#1a3a1a] text-[#66cc66] hover:bg-[#223a22] disabled:opacity-40 transition-colors">Run</button>
          <button type="button" onClick={() => setRunning(false)} disabled={!running}
            className="px-3 py-1 text-[10px] border border-[#5a4400] bg-[#3a2a00] text-[#ccaa00] hover:bg-[#4a3800] disabled:opacity-40 transition-colors">Pause</button>
          <button type="button" onClick={() => { setRunning(false); runningRef.current = false; cancelAnimationFrame(rafRef.current); initSim(cfgRef.current); }} disabled={generating}
            className="px-3 py-1 text-[10px] border border-[#2a2a2a] bg-[#1a1a1a] text-[#888] hover:bg-[#222] disabled:opacity-40 transition-colors">Reset</button>
          <button type="button" onClick={handleStep} disabled={running || generating}
            className="px-3 py-1 text-[10px] border border-[#1a2e4a] bg-[#0e1a2e] text-[#4488cc] hover:bg-[#142238] disabled:opacity-40 transition-colors">Step</button>
          <button type="button" onClick={() => { if (!running) initSim(cfgRef.current); }} disabled={running || generating}
            className="px-3 py-1 text-[10px] border border-[#2a1a38] bg-[#1a1020] text-[#9966cc] hover:bg-[#221430] disabled:opacity-40 transition-colors">Regen</button>

          <div className="ml-auto flex items-center gap-1">
            <span className="text-[8px] text-[#444] mr-1">Color:</span>
            {(["income", "liquidwealth", "networth", "debt", "age", "utility", "group", "tenure"] as const).map(mode => (
              <button key={mode} type="button" onClick={() => updateCfg("colorMode", mode)}
                className={`px-1.5 py-0.5 text-[8px] border transition-colors ${cfg.colorMode === mode ? "bg-[#1a2a3a] border-[#2a4a6a] text-[#88aadd]" : "bg-[#111] border-[#1e1e1e] text-[#444] hover:text-[#777]"}`}>
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[#1c1c1c]">
          <span className="text-[9px] text-[#444] uppercase tracking-wider shrink-0">Presets:</span>
          {([
            { label: "Balanced", patch: {} },
            { label: "High Inequality", patch: { moneyIqEffect: 1.5, accessibilityPriceEffect: 160, inheritanceRetention: 0.3, moneyIqPersistence: 0.8 } },
            { label: "Debt Crisis", patch: { overdraftRate: 0.08, rentFactor: 0.12, basePrice: 200, accessibilityPriceEffect: 150, consumptionPhi: 0.7 } },
            { label: "Homeowners", patch: { installmentM: 0.005, installmentN: 48, affordabilityKappa: 0.6, rentFactor: 0.15, lambdaW: 0.30 } },
            { label: "Renters", patch: { basePrice: 300, installmentM: 0.04, rentFactor: 0.04, affordabilityKappa: 0.25 } },
            { label: "Schelling 4G", patch: { numGroups: 4, groupTolerance: 0.40, lambdaG: 0.35 } },
            { label: "Barrier-Heavy", patch: { riverAmount: 4, mountainAmount: 4, blockedAmount: 3, roadDensity: 1.8, lambdaT: 0.25 } },
            { label: "Sticky", patch: { movingCostBase: 0.4, movingCostDist: 0.4, utilityThreshold: 0.2 } },
          ] as { label: string; patch: Partial<Config> }[]).map(({ label, patch }) => (
            <button key={label} type="button" disabled={running || generating}
              onClick={() => { const next = { ...DEFAULT_CONFIG, ...patch }; cfgRef.current = next; setCfg(next); initSim(next); }}
              className="px-2 py-0.5 text-[9px] border border-[#2a2a2a] bg-[#141414] text-[#666] hover:text-[#bbb] hover:border-[#3a3a3a] disabled:opacity-40 transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Sliders — 6 columns */}
        <div className="grid grid-cols-6 gap-x-5 gap-y-0.5">

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Geography</div>
            <Slider label="Grid size"      k="gridSize"               min={40} max={100} />
            <Slider label="Rivers"         k="riverAmount"            min={0}  max={4} />
            <Slider label="Mountains"      k="mountainAmount"         min={0}  max={4} />
            <Slider label="Blocked"        k="blockedAmount"          min={0}  max={3} />
            <Slider label="Commercial #"   k="commercialCount"        min={1}  max={5} />
            <Slider label="Compactness"    k="commercialCompactness"  min={0.3} max={1.0} step={0.05} decimals={2} />
            <Slider label="Road density"   k="roadDensity"            min={0.5} max={2.0} step={0.1} decimals={1} />
            <Slider label="Pop. density"   k="populationDensity"      min={0.1} max={0.7} step={0.05} decimals={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Income & Prices</div>
            <Slider label="Base income Y₀" k="baseIncome"                  min={10}  max={200} />
            <Slider label="MoneyIQ αM"     k="moneyIqEffect"               min={-1}  max={2}   step={0.05} decimals={2} />
            <Slider label="Access. inc. αA" k="accessibilityIncomeEffect"  min={-1}  max={1}   step={0.05} decimals={2} />
            <Slider label="Base price P₀"  k="basePrice"                  min={10}  max={500} />
            <Slider label="Access. price"  k="accessibilityPriceEffect"   min={0}   max={200} />
            <Slider label="Density price"  k="densityPriceEffect"         min={0}   max={50} />
            <Slider label="Demand price"   k="demandPriceEffect"          min={0}   max={80} />
            <Slider label="Demand decay"   k="demandDecay"                min={0.5} max={1.0} step={0.01} decimals={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Financing</div>
            <Slider label="Mortgage N"     k="installmentN"    min={2}    max={60} />
            <Slider label="Mortgage rate m" k="installmentM"  min={0}    max={0.10} step={0.002} decimals={3} />
            <Slider label="Rent factor"    k="rentFactor"      min={0.02} max={0.20} step={0.01} decimals={2} />
            <Slider label="Maintenance"    k="maintenanceRate" min={0.001} max={0.02} step={0.001} decimals={3} />
            <Slider label="Overdraft rate" k="overdraftRate"   min={0}    max={0.10} step={0.005} decimals={3} />
            <Slider label="MPC φ"          k="consumptionPhi"  min={0.1}  max={0.9} step={0.05} decimals={2} />
            <Slider label="Afford. κ"      k="affordabilityKappa" min={0.1} max={1.0} step={0.05} decimals={2} />
            <Slider label="Basic cost"     k="basicCost"       min={0}    max={20} />
            <Slider label="Commute factor" k="commuteCostFactor" min={0}  max={0.5} step={0.01} decimals={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Utility Weights</div>
            <Slider label="λC consumption"  k="lambdaC"   min={0} max={1}   step={0.05} decimals={2} />
            <Slider label="λW liquid wealth" k="lambdaW"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λH housing svc"  k="lambdaH"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λA accessibility" k="lambdaA" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λN nbhd quality" k="lambdaN"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λS social fit"   k="lambdaS"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λT travel"       k="lambdaT"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λD debt burden"  k="lambdaD"  min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λArr arrears"    k="lambdaArr" min={0} max={0.5} step={0.05} decimals={2} />
            <Slider label="λG group pref."  k="lambdaG"  min={0} max={0.5} step={0.05} decimals={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Schelling & Social</div>
            <Slider label="Groups G"        k="numGroups"      min={1} max={8} step={1} decimals={0} />
            <Slider label="Tolerance τ_G"  k="groupTolerance" min={0} max={1.0} step={0.05} decimals={2} />
            <div className="mt-1 flex flex-wrap gap-1">
              {Array.from({ length: cfg.numGroups }, (_, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <div className="w-2 h-2 border border-[#333]" style={{ backgroundColor: `rgb(${GROUP_COLORS[i % GROUP_COLORS.length].join(",")})` }} />
                  <span className="text-[7px] text-[#444]">G{i}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5 border-b border-[#1a1a1a] pb-0.5">Mobility & Sim</div>
            <Slider label="Utility thresh. τ" k="utilityThreshold"  min={0}   max={0.5}  step={0.01} decimals={2} />
            <Slider label="Move cost μ₀"    k="movingCostBase"     min={0}   max={1.0}  step={0.05} decimals={2} />
            <Slider label="Move dist μ₁"    k="movingCostDist"     min={0}   max={1.0}  step={0.05} decimals={2} />
            <Slider label="Max age"         k="maxAge"             min={60}  max={120} />
            <Slider label="Avg death age"   k="avgDeathAge"        min={40}  max={90} />
            <Slider label="Inherit. ρW"     k="inheritanceRetention" min={0}  max={1}   step={0.05} decimals={2} />
            <Slider label="MoneyIQ η"       k="moneyIqPersistence" min={0}   max={1}   step={0.05} decimals={2} />
            <Slider label="Speed ms/step"   k="speed"              min={30}  max={500} />
            <Slider label="Max steps"       k="maxSteps"           min={100} max={10000} step={100} />
            <Slider label="Seed"            k="seed"               min={0}   max={9999} />
          </div>
        </div>
      </div>
    </div>
  );
}
