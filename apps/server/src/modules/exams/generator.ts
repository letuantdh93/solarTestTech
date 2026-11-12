/**
 * Automatic question selection.
 *
 * 1. Difficulty percentages → integer targets (largest-remainder rounding).
 * 2. Category × difficulty allocation solved as a max-flow problem:
 *      source → category (cap = requested count)
 *      category → difficulty (cap = available questions in that cell)
 *      difficulty → sink (cap = difficulty target)
 *    Phase A uses exact difficulty targets. If the bank cannot satisfy them,
 *    phase B lifts the difficulty caps so the category counts can still be met,
 *    and the deviation is REPORTED (never hidden).
 *    Categories are never substituted: a category with too few questions is a shortfall.
 * 3. Within each cell: seeded random pick, respecting max questions per concept,
 *    preferring calculation / scenario questions while their minimums are unmet,
 *    followed by a swap pass to satisfy remaining minimums.
 */
import { rng, shuffle, type GenerationConfig } from '@solar/shared';

export interface PoolQuestion {
  id: string;
  code: string;
  categoryId: string;
  difficulty: number;
  type: string;
  isCalculation: boolean;
  isScenario: boolean;
  conceptKey: string | null;
}

export interface Shortfall {
  kind: 'CATEGORY' | 'DIFFICULTY' | 'CALCULATION' | 'SCENARIO' | 'TOTAL';
  key?: string;
  requested: number;
  achieved: number;
  message: string;
}

export interface GenerationResult {
  questionIds: string[];
  feasible: boolean; // true only when every constraint is met exactly
  difficultyTargets: Record<number, number>;
  allocation: Array<{ categoryId: string; requested: number; available: number; selected: number; byDifficulty: Record<number, number> }>;
  difficultyActual: Record<number, number>;
  calculationCount: number;
  scenarioCount: number;
  shortfalls: Shortfall[];
}

export function difficultyTargets(total: number, pct: Record<string | number, number>): Record<number, number> {
  const raw = [1, 2, 3, 4].map((d) => ({ d, v: (total * (Number(pct[d]) || 0)) / 100 }));
  const out: Record<number, number> = {};
  let assigned = 0;
  for (const r of raw) {
    out[r.d] = Math.floor(r.v);
    assigned += out[r.d]!;
  }
  const order = [...raw].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || b.d - a.d);
  for (let i = 0; assigned < total && i < order.length * 4; i++) {
    out[order[i % order.length]!.d]!++;
    assigned++;
  }
  return out;
}

/** Edmonds–Karp max flow on a small dense graph. cap is mutated into residuals. */
function maxFlow(cap: number[][], s: number, t: number): number {
  const n = cap.length;
  let flow = 0;
  for (;;) {
    const parent = new Array<number>(n).fill(-1);
    parent[s] = s;
    const q = [s];
    while (q.length && parent[t] === -1) {
      const u = q.shift()!;
      for (let v = 0; v < n; v++)
        if (parent[v] === -1 && cap[u]![v]! > 0) {
          parent[v] = u;
          q.push(v);
        }
    }
    if (parent[t] === -1) return flow;
    let f = Infinity;
    for (let v = t; v !== s; v = parent[v]!) f = Math.min(f, cap[parent[v]!]![v]!);
    for (let v = t; v !== s; v = parent[v]!) {
      cap[parent[v]!]![v]! -= f;
      cap[v]![parent[v]!]! += f;
    }
    flow += f;
  }
}

/** Effective capacity of a cell given the max-per-concept limit. */
function cellCapacity(qs: PoolQuestion[], maxPerConcept: number) {
  const groups = new Map<string, number>();
  let free = 0;
  for (const q of qs) {
    if (!q.conceptKey) free++;
    else groups.set(q.conceptKey, (groups.get(q.conceptKey) ?? 0) + 1);
  }
  let c = free;
  for (const n of groups.values()) c += Math.min(n, maxPerConcept);
  return c;
}

export function generateSelection(pool: PoolQuestion[], cfg: GenerationConfig, labels: Record<string, string> = {}): GenerationResult {
  const rand = rng(cfg.seed ?? Date.now());
  const types = new Set(cfg.questionTypes);
  const requested = cfg.categoryDistribution.filter((c) => c.count > 0);
  const total = requested.reduce((a, c) => a + c.count, 0);
  const targets = difficultyTargets(total, cfg.difficultyDistribution);
  const shortfalls: Shortfall[] = [];
  const label = (id: string) => labels[id] ?? id;

  if (total !== cfg.totalQuestions)
    shortfalls.push({ kind: 'TOTAL', requested: cfg.totalQuestions, achieved: total, message: `Tổng phân bố theo lĩnh vực (${total}) khác tổng số câu yêu cầu (${cfg.totalQuestions}).` });

  const eligible = pool.filter((q) => types.has(q.type as never));
  const cells = new Map<string, PoolQuestion[]>();
  for (const q of eligible) {
    const k = `${q.categoryId}|${q.difficulty}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(q);
  }

  // Graph: 0 = source, 1..C = categories, C+1..C+4 = difficulty 1..4, C+5 = sink
  const C = requested.length;
  const S = 0;
  const T = C + 5;
  const build = (diffCap: (d: number) => number) => {
    const cap = Array.from({ length: C + 6 }, () => new Array<number>(C + 6).fill(0));
    requested.forEach((r, i) => {
      cap[S]![i + 1] = r.count;
      for (let d = 1; d <= 4; d++) cap[i + 1]![C + d] = cellCapacity(cells.get(`${r.categoryId}|${d}`) ?? [], cfg.maxPerConcept);
    });
    for (let d = 1; d <= 4; d++) cap[C + d]![T] = diffCap(d);
    return cap;
  };
  const exact = build((d) => targets[d] ?? 0);
  const orig = exact.map((r) => [...r]);
  const flowA = maxFlow(exact, S, T);
  let residual = exact;
  if (flowA < total) {
    // Phase B: lift difficulty caps to still satisfy category counts.
    for (let d = 1; d <= 4; d++) {
      residual[C + d]![T]! += total;
      orig[C + d]![T]! += total;
    }
    maxFlow(residual, S, T);
  }
  // Read allocation from flows: flow(u,v) = orig cap - residual cap
  const alloc: Record<string, Record<number, number>> = {};
  requested.forEach((r, i) => {
    alloc[r.categoryId] = {};
    for (let d = 1; d <= 4; d++) alloc[r.categoryId]![d] = Math.max(0, orig[i + 1]![C + d]! - residual[i + 1]![C + d]!);
  });

  // Pick questions per cell
  const conceptUse = new Map<string, number>();
  const picked: PoolQuestion[] = [];
  const pickedIds = new Set<string>();
  const minCalc = cfg.minCalculation ?? 0;
  const minScen = cfg.minScenario ?? 0;
  const deficit = () => ({
    calc: minCalc - picked.filter((q) => q.isCalculation).length,
    scen: minScen - picked.filter((q) => q.isScenario).length,
  });
  const conceptOk = (q: PoolQuestion) => !q.conceptKey || (conceptUse.get(q.conceptKey) ?? 0) < cfg.maxPerConcept;
  const take = (q: PoolQuestion) => {
    picked.push(q);
    pickedIds.add(q.id);
    if (q.conceptKey) conceptUse.set(q.conceptKey, (conceptUse.get(q.conceptKey) ?? 0) + 1);
  };

  // Process cells in random order so preference for calc/scenario is spread across categories.
  const cellOrder = shuffle(
    requested.flatMap((r) => [1, 2, 3, 4].map((d) => ({ categoryId: r.categoryId, d, n: alloc[r.categoryId]![d]! }))).filter((x) => x.n > 0),
    rand,
  );
  const unfilled: Record<string, number> = {};
  for (const cell of cellOrder) {
    let candidates = shuffle(cells.get(`${cell.categoryId}|${cell.d}`) ?? [], rand);
    for (let k = 0; k < cell.n; k++) {
      const def = deficit();
      candidates = candidates.filter((q) => !pickedIds.has(q.id) && conceptOk(q));
      if (!candidates.length) {
        unfilled[cell.categoryId] = (unfilled[cell.categoryId] ?? 0) + (cell.n - k);
        break;
      }
      const score = (q: PoolQuestion) => (def.calc > 0 && q.isCalculation ? 2 : 0) + (def.scen > 0 && q.isScenario ? 1 : 0);
      const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a), candidates[0]!);
      take(best);
    }
  }

  // Swap pass to satisfy remaining calc/scenario minimums within the same cell.
  for (const flag of ['isCalculation', 'isScenario'] as const) {
    const need = () => (flag === 'isCalculation' ? deficit().calc : deficit().scen);
    if (need() <= 0) continue;
    for (const cur of shuffle([...picked], rand)) {
      if (need() <= 0) break;
      if (cur[flag]) continue;
      // don't break the other minimum
      if (flag === 'isScenario' && cur.isCalculation && deficit().calc >= 0) continue;
      if (flag === 'isCalculation' && cur.isScenario && deficit().scen >= 0) continue;
      const alt = (cells.get(`${cur.categoryId}|${cur.difficulty}`) ?? []).find(
        (q) => q[flag] && !pickedIds.has(q.id) && (!q.conceptKey || q.conceptKey === cur.conceptKey || (conceptUse.get(q.conceptKey) ?? 0) < cfg.maxPerConcept),
      );
      if (!alt) continue;
      picked.splice(picked.indexOf(cur), 1);
      pickedIds.delete(cur.id);
      if (cur.conceptKey) conceptUse.set(cur.conceptKey, (conceptUse.get(cur.conceptKey) ?? 1) - 1);
      take(alt);
    }
  }

  // Report
  const allocation = requested.map((r) => {
    const sel = picked.filter((q) => q.categoryId === r.categoryId);
    const byDifficulty: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const q of sel) byDifficulty[q.difficulty]!++;
    const available = eligible.filter((q) => q.categoryId === r.categoryId).length;
    if (sel.length < r.count)
      shortfalls.push({
        kind: 'CATEGORY',
        key: r.categoryId,
        requested: r.count,
        achieved: sel.length,
        message: `Lĩnh vực ${label(r.categoryId)}: yêu cầu ${r.count} câu, chỉ chọn được ${sel.length} câu (khả dụng ${available}, sau khi áp dụng giới hạn khái niệm/loại câu hỏi).`,
      });
    return { categoryId: r.categoryId, requested: r.count, available, selected: sel.length, byDifficulty };
  });
  const difficultyActual: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const q of picked) difficultyActual[q.difficulty]!++;
  const names = ['', 'Cơ bản', 'Trung bình', 'Nâng cao', 'Chuyên gia'];
  for (let d = 1; d <= 4; d++)
    if (difficultyActual[d] !== targets[d])
      shortfalls.push({ kind: 'DIFFICULTY', key: String(d), requested: targets[d]!, achieved: difficultyActual[d]!, message: `Độ khó ${names[d]}: yêu cầu ${targets[d]} câu, thực tế ${difficultyActual[d]} câu.` });
  const calc = picked.filter((q) => q.isCalculation).length;
  const scen = picked.filter((q) => q.isScenario).length;
  if (calc < minCalc) shortfalls.push({ kind: 'CALCULATION', requested: minCalc, achieved: calc, message: `Số câu tính toán: yêu cầu tối thiểu ${minCalc}, thực tế ${calc}.` });
  if (scen < minScen) shortfalls.push({ kind: 'SCENARIO', requested: minScen, achieved: scen, message: `Số câu tình huống: yêu cầu tối thiểu ${minScen}, thực tế ${scen}.` });

  // Final order: by category order then difficulty (randomisation per attempt happens at delivery)
  const catIndex = new Map(requested.map((r, i) => [r.categoryId, i]));
  picked.sort((a, b) => catIndex.get(a.categoryId)! - catIndex.get(b.categoryId)! || a.difficulty - b.difficulty || a.code.localeCompare(b.code));

  return {
    questionIds: picked.map((q) => q.id),
    feasible: shortfalls.length === 0,
    difficultyTargets: targets,
    allocation,
    difficultyActual,
    calculationCount: calc,
    scenarioCount: scen,
    shortfalls,
  };
}
