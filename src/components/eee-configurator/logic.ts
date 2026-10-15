/* EEE Tech Configurator — filtering logic (framework-free, shared by the React component). */

/** One row of the catalog produced by sync/sync.py (compact keys keep the file small). */
export interface Product {
  r: string;               // reference: orderable part number or series
  s?: string;              // series
  c?: string;              // product type / category (Power Fuses, Pyro Fuses, …)
  p?: string;              // protection class = utilization category (gG, aR, aBat, gPV, F, T, EV)
  v?: [string, number][];  // rated voltages [["DC", 1000], ["AC", 1250]]
  i?: [number | null, number | null]; // rated current [min, max] A (equal for a single rating)
  b?: number;              // breaking capacity kA
  l?: number;              // power loss W
  lc?: string;             // power loss condition
  tc?: [number, number];   // DC time constant of the breaking test, ms
  i2?: number;             // clearing I²t A²s
  i2p?: number;            // pre-arcing I²t A²s
  mt?: string;             // mounting type
  md?: string;             // mounting detail
  sz?: string;             // size code
  std?: string;            // standards
  app?: string;            // applications
  am?: string;             // after-market readiness
  ds?: string;             // datasheet URL
  u?: string;              // product page URL (absolute, or relative to productBaseUrl)
  n?: string;              // note
}

export type MatchMode = "exact" | "approx";

export interface Criteria {
  i: number | null; v: number | null; vt: "" | "AC" | "DC"; b: number | null; l: number | null;
  ct: string[]; pc: string[];
  tc: number | null; i2: number | null; mt: string[]; sz: string; ap: string[];
  inc: boolean; m: MatchMode;
}

export const EMPTY: Criteria = {
  i: null, v: null, vt: "", b: null, l: null, ct: [], pc: [],
  tc: null, i2: null, mt: [], sz: "", ap: [], inc: false, m: "exact",
};

export interface Rules {
  breaking: "min" | "max";  // min: product >= entered (fault current to interrupt)
  loss: "min" | "max";      // max: product <= entered
  tolerance: number;        // fraction, 0.05 = ±5 %
}

export interface Deviation { label: string; pct: number }
export interface Result { r: "pass" | "approx" | "unknown" | "fail"; missing: string[]; dev: Deviation[] }

export const norm = (s?: string) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
export const num = (x: string) => { const n = parseFloat(String(x).replace(",", ".")); return Number.isFinite(n) ? n : null; };
export const fmt = (n?: number | null) => (n == null ? "" : (Math.round(n * 1000) / 1000).toLocaleString("en-US"));

/** 'New Energy Vehicles (Japan) / Energy Storage' -> ['New Energy Vehicles', 'Energy Storage'] */
export const appTags = (app?: string) =>
  String(app ?? "").split("/").map((x) => x.replace(/\(.*?\)/g, "").trim()).filter(Boolean);

export const hasMore = (c: Criteria) => c.tc != null || c.i2 != null || c.mt.length > 0 || !!c.sz || c.ap.length > 0;
export const hasCriteria = (c: Criteria) =>
  c.i != null || c.v != null || c.b != null || c.l != null || c.pc.length > 0 || c.ct.length > 0 || hasMore(c);

export function test(p: Product, c: Criteria, rules: Rules): Result {
  const missing: string[] = [];
  const dev: Deviation[] = [];
  const tol = c.m === "approx" ? rules.tolerance : 0;
  const fail: Result = { r: "fail", missing, dev };
  /* dir 'min': product must be >= target; 'max': product must be <= target */
  const check = (label: string, value: number, target: number, dir: "min" | "max") => {
    if (dir === "min" ? value >= target : value <= target) return true;
    const ok = dir === "min" ? value >= target * (1 - tol) : value <= target * (1 + tol);
    if (ok && tol) dev.push({ label, pct: target ? ((value - target) / target) * 100 : 0 });
    return ok;
  };

  if (c.ct.length && (!p.c || !c.ct.includes(p.c))) return fail;
  if (c.pc.length && (!p.p || !c.pc.includes(p.p))) return fail;
  if (c.i != null) {
    const imax = p.i?.[1] ?? null;
    if (imax == null) missing.push("rated current");
    else if (!check("rated current", imax, c.i, "min")) return fail;
  }
  if (c.v != null || c.vt) {
    const vs = (p.v ?? []).filter(([t]) => !c.vt || t === c.vt || t === "?");
    if (!p.v?.length) missing.push("rated voltage");
    else if (!vs.length) return fail;
    else if (c.v != null && !check("rated voltage", Math.max(...vs.map(([, x]) => x)), c.v, "min")) return fail;
  }
  if (c.b != null) {
    if (p.b == null) missing.push("breaking capacity");
    else if (!check("breaking capacity", p.b * 1000, c.b, rules.breaking)) return fail;
  }
  if (c.l != null) {
    if (p.l == null) missing.push("power loss");
    else if (!check("power loss", p.l, c.l, rules.loss)) return fail;
  }
  if (c.tc != null) {
    if (!p.tc) missing.push("time constant");
    else if (!check("time constant", p.tc[1], c.tc, "min")) return fail;
  }
  if (c.i2 != null) {
    if (p.i2 == null) missing.push("clearing I²t");
    else if (!check("clearing I²t", p.i2, c.i2, "max")) return fail;
  }
  if (c.mt.length) { if (!p.mt) missing.push("mounting"); else if (!c.mt.includes(p.mt)) return fail; }
  if (c.sz) { if (!p.sz) missing.push("size"); else if (String(p.sz) !== c.sz) return fail; }
  if (c.ap.length) {
    const tags = appTags(p.app);
    if (!tags.length) missing.push("application");
    else if (!tags.some((t) => c.ap.includes(t))) return fail;
  }
  return { r: missing.length ? "unknown" : dev.length ? "approx" : "pass", missing, dev };
}

export interface Row { p: Product; idx: number; res: Result }
export type SortKey = "r" | "c" | "p" | "v" | "i" | "b" | "l" | "i2";

const rank = (row: Row) => (row.res.r === "unknown" ? 2 : row.res.r === "approx" ? 1 : 0);

export function sortRows(rows: Row[], key: SortKey | null, dir: 1 | -1): Row[] {
  const val = (p: Product): number | string | null => {
    if (key === "v") return p.v?.length ? Math.max(...p.v.map(([, x]) => x)) : null;
    if (key === "i") return p.i ? (p.i[0] ?? p.i[1]) : null;
    const x = key ? (p as unknown as Record<string, unknown>)[key] : null;
    return x == null ? null : (x as number | string);
  };
  return [...rows].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (!key) return a.idx - b.idx;
    const x = val(a.p), y = val(b.p);
    if (x == null && y == null) return a.idx - b.idx;
    if (x == null) return 1;
    if (y == null) return -1;
    const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return d * dir || a.idx - b.idx;
  });
}

export function describeCriteria(c: Criteria, rules: Rules): string {
  const parts: string[] = [];
  if (c.i != null) parts.push(`Rated current ≥ ${fmt(c.i)} A`);
  if (c.v != null) parts.push(`Rated voltage ≥ ${fmt(c.v)} V${c.vt ? " " + c.vt : ""}`);
  else if (c.vt) parts.push(`Voltage type ${c.vt}`);
  if (c.ct.length) parts.push(`Product type: ${c.ct.join(", ")}`);
  if (c.pc.length) parts.push(`Protection class: ${c.pc.join(", ")}`);
  if (c.b != null) parts.push(`Breaking capacity ${rules.breaking === "max" ? "≤" : "≥"} ${fmt(c.b)} A`);
  if (c.l != null) parts.push(`Power loss ${rules.loss === "min" ? "≥" : "≤"} ${fmt(c.l)} W`);
  if (c.tc != null) parts.push(`Circuit time constant ${fmt(c.tc)} ms`);
  if (c.i2 != null) parts.push(`Clearing I²t ≤ ${fmt(c.i2)} A²s`);
  if (c.mt.length) parts.push(`Mounting: ${c.mt.join(", ")}`);
  if (c.sz) parts.push(`Size ${c.sz}`);
  if (c.ap.length) parts.push(`Application: ${c.ap.join(", ")}`);
  if (parts.length && c.m === "approx") parts.push(`approximate match accepted (±${fmt(rules.tolerance * 100)} %)`);
  return parts.join("; ");
}

/* ---------- criteria <-> URL query (shareable links) ---------- */
const LIST_KEYS = ["ct", "pc", "mt", "ap"] as const;
const NUM_KEYS = ["i", "v", "b", "l", "tc", "i2"] as const;

export function toQuery(c: Criteria, params: URLSearchParams) {
  [...NUM_KEYS, ...LIST_KEYS, "vt", "sz", "inc", "mm"].forEach((k) => params.delete("eee_" + k));
  NUM_KEYS.forEach((k) => { if (c[k] != null) params.set("eee_" + k, String(c[k])); });
  LIST_KEYS.forEach((k) => { if (c[k].length) params.set("eee_" + k, c[k].join(",")); });
  if (c.vt) params.set("eee_vt", c.vt);
  if (c.sz) params.set("eee_sz", c.sz);
  if (c.inc) params.set("eee_inc", "1");
  if (c.m === "approx") params.set("eee_mm", "approx");
}

export function fromQuery(params: URLSearchParams): Criteria {
  const c: Criteria = { ...EMPTY, ct: [], pc: [], mt: [], ap: [] };
  NUM_KEYS.forEach((k) => { const v = params.get("eee_" + k); if (v != null) c[k] = num(v); });
  LIST_KEYS.forEach((k) => { const v = params.get("eee_" + k); if (v) c[k] = v.split(","); });
  const vt = params.get("eee_vt"); if (vt === "AC" || vt === "DC") c.vt = vt;
  c.sz = params.get("eee_sz") ?? "";
  c.inc = params.get("eee_inc") === "1";
  c.m = params.get("eee_mm") === "approx" ? "approx" : "exact";
  return c;
}
