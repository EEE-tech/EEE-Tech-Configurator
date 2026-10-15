/* EEE Tech Configurator — React component for the EEE.tech website (Lovable).
   No dependencies besides React. Safe for server rendering: the catalog is loaded and the URL is read in effects. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import "./eee-configurator.css";
import {
  appTags, describeCriteria, fmt, fromQuery, hasCriteria, hasMore, norm, num, sortRows, test, toQuery,
  type Criteria, type MatchMode, type Product, type Row, type Rules, type SortKey,
} from "./logic";

export interface EEEConfiguratorProps {
  /** URL of catalog.json: the Lovable Cloud function, or a static file such as "/configurator/catalog.json" */
  catalogUrl: string;
  /** Tried when catalogUrl fails, e.g. the snapshot shipped with the site */
  fallbackCatalogUrl?: string;
  /** Prefix for relative product links in the catalog, e.g. "https://shop.eee.tech" */
  productBaseUrl?: string;
  /** POST endpoint for product requests (the configurator edge function). Without it the visitor's e-mail app opens. */
  requestEndpoint?: string;
  /** Extra headers for the request endpoint, e.g. { apikey: <publishable key> } */
  requestHeaders?: Record<string, string>;
  /** Address shown in the request dialog and used for the "open in my e-mail app" link */
  contactEmail: string;
  title?: string;
  intro?: string;
  /** Approximate-match tolerance in percent (default 5) */
  tolerance?: number;
  /** "min": product breaking capacity ≥ entered value (default). "max": ≤ entered value */
  breakingRule?: "min" | "max";
  /** "max": product power loss ≤ entered value (default). "min": ≥ entered value */
  lossRule?: "min" | "max";
  pageSize?: number;
  accentColor?: string;
}

type ListKey = "ct" | "pc" | "mt" | "ap";
interface FormState {
  i: string; v: string; vt: "" | "AC" | "DC"; b: string; l: string; tc: string; i2: string; sz: string;
  ct: string[]; pc: string[]; mt: string[]; ap: string[]; inc: boolean; m: MatchMode;
}
const EMPTY_FORM: FormState = { i: "", v: "", vt: "", b: "", l: "", tc: "", i2: "", sz: "", ct: [], pc: [], mt: [], ap: [], inc: false, m: "exact" };

const toCriteria = (f: FormState): Criteria => ({
  i: num(f.i), v: num(f.v), vt: f.vt, b: num(f.b), l: num(f.l), tc: num(f.tc), i2: num(f.i2), sz: f.sz,
  ct: f.ct, pc: f.pc, mt: f.mt, ap: f.ap, inc: f.inc, m: f.m,
});
const toForm = (c: Criteria): FormState => ({
  i: c.i?.toString() ?? "", v: c.v?.toString() ?? "", vt: c.vt, b: c.b?.toString() ?? "", l: c.l?.toString() ?? "",
  tc: c.tc?.toString() ?? "", i2: c.i2?.toString() ?? "", sz: c.sz, ct: c.ct, pc: c.pc, mt: c.mt, ap: c.ap, inc: c.inc, m: c.m,
});

const COLS: { key: SortKey | "ds"; label: string }[] = [
  { key: "r", label: "Reference" }, { key: "c", label: "Category" }, { key: "p", label: "Protection class" },
  { key: "v", label: "Rated voltage" }, { key: "i", label: "Rated current" }, { key: "b", label: "Breaking capacity" },
  { key: "l", label: "Power loss" }, { key: "i2", label: "I²t clearing" }, { key: "ds", label: "Datasheet" },
];

function countBy(products: Product[], values: (p: Product) => string[]) {
  const m = new Map<string, number>();
  products.forEach((p) => values(p).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

export default function EEEConfigurator({
  catalogUrl, fallbackCatalogUrl, productBaseUrl = "", requestEndpoint, requestHeaders, contactEmail,
  title = "EEE Tech Configurator",
  intro = "Enter your electrical requirements to list every fuse and relay that meets them. Leave a field empty to ignore it.",
  tolerance = 5, breakingRule = "min", lossRule = "max", pageSize = 50, accentColor,
}: EEEConfiguratorProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [toast, setToast] = useState<string | null>(null);
  const rules: Rules = { breaking: breakingRule, loss: lossRule, tolerance: tolerance / 100 };

  /* load catalog */
  useEffect(() => {
    let alive = true;
    const load = (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
    load(catalogUrl)
      .catch((e) => { if (fallbackCatalogUrl && fallbackCatalogUrl !== catalogUrl) return load(fallbackCatalogUrl); throw e; })
      .then((d) => {
        if (!alive) return;
        setProducts(Array.isArray(d) ? d : d.products ?? []);
        setUpdated(Array.isArray(d) ? null : d.generated ?? null);
      })
      .catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, [catalogUrl, fallbackCatalogUrl]);

  /* restore criteria from the URL once, then keep the URL in sync (shareable searches) */
  useEffect(() => {
    const c = fromQuery(new URLSearchParams(window.location.search));
    setForm(toForm(c));
    if (hasMore(c)) setMoreOpen(true);
    setReady(true);
  }, []);
  const criteria = useMemo(() => toCriteria(form), [form]);
  useEffect(() => {
    if (!ready) return;
    const u = new URL(window.location.href);
    toQuery(criteria, u.searchParams);
    window.history.replaceState(window.history.state, "", u.toString());
  }, [criteria, ready]);

  useEffect(() => { setLimit(pageSize); }, [criteria, pageSize]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const all = products ?? [];
  const options = useMemo(() => ({
    ct: countBy(all, (p) => (p.c ? [p.c] : [])),
    pc: countBy(all, (p) => (p.p ? [p.p] : [])),
    mt: countBy(all, (p) => (p.mt ? [p.mt] : [])),
    ap: countBy(all, (p) => appTags(p.app)),
    sz: countBy(all, (p) => (p.sz ? [p.sz] : [])).map(([k]) => k),
  }), [all]);

  const active = hasCriteria(criteria);
  const result = useMemo(() => {
    const pass: Row[] = [], approx: Row[] = [], unknown: Row[] = [];
    all.forEach((p, idx) => {
      const res = test(p, criteria, rules);
      if (res.r === "pass") pass.push({ p, idx, res });
      else if (res.r === "approx") approx.push({ p, idx, res });
      else if (res.r === "unknown") unknown.push({ p, idx, res });
    });
    const rows = sortRows([...pass, ...approx, ...(criteria.inc ? unknown : [])], sort.key, sort.dir);
    return { pass: pass.length, approx: approx.length, unknown: unknown.length, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, criteria, sort, tolerance, breakingRule, lossRule]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: ListKey, v: string) =>
    setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const reset = () => { setForm({ ...EMPTY_FORM, m: form.m }); setShowAll(false); };
  const tolTxt = `±${fmt(tolerance)} %`;

  /* ---------- request dialog ---------- */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [req, setReq] = useState<{ product: Product | null; subject: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const openRequest = (p: Product | null) => {
    const crit = describeCriteria(criteria, rules);
    const subject = p ? `Request for ${p.r}` : "Product request from the EEE Tech Configurator";
    const body = "Hello EEE Tech team,\n\n" +
      (p ? `I am interested in ${p.r}${p.s && norm(p.s) !== norm(p.r) ? ` (series ${p.s})` : ""}. ` +
        "Could you send me price, availability, lead time and minimum order quantity?\n"
        : "I could not find a product meeting my requirements. Could you propose a solution?\n") +
      (crit ? `\nMy requirements: ${crit}\n` : "") + "\nApplication:\n\nBest regards,\n";
    setReq({ product: p, subject, body });
    setSendError(false);
    dialogRef.current?.showModal();
  };
  const mailto = req ? `mailto:${contactEmail}?subject=${encodeURIComponent(req.subject)}&body=${encodeURIComponent(req.body)}` : "#";

  const submitRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!req) return;
    const fd = new FormData(e.currentTarget);
    const message = String(fd.get("message") ?? req.body);
    if (!requestEndpoint) {
      window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(req.subject)}&body=${encodeURIComponent(message)}`;
      dialogRef.current?.close();
      return;
    }
    setSending(true);
    setSendError(false);
    try {
      const r = await fetch(requestEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(requestHeaders ?? {}) },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), company: fd.get("company"), quantity: fd.get("quantity"),
          message, subject: req.subject, reference: req.product?.r ?? null, series: req.product?.s ?? null,
          criteria: describeCriteria(criteria, rules), page: window.location.href,
          website: fd.get("website"), // honeypot, must stay empty
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      dialogRef.current?.close();
      setToast("Thank you — your request has been sent. We will reply shortly.");
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const productHref = (u: string) => (/^https?:/.test(u) ? u : productBaseUrl.replace(/\/$/, "") + (u.startsWith("/") ? u : "/" + u));
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  /* ---------- render ---------- */
  const chipRow = (k: ListKey, items: [string, number][]) =>
    items.length ? items.map(([v, n]) => (
      <label key={v} className="eee-config__chip">
        <input type="checkbox" checked={form[k].includes(v)} onChange={() => toggle(k, v)} />
        <span>{v} <em>{n}</em></span>
      </label>
    )) : <span className="eee-config__muted">No data in the catalog yet</span>;

  const dash = <span className="eee-config__muted">—</span>;
  const shown = result.rows.slice(0, limit);

  return (
    <section className="eee-config is-open is-page" id="eee-configurator"
      style={accentColor ? ({ "--eee-accent": accentColor } as CSSProperties) : undefined}>
      <div className="eee-config__panel">
        <div className="eee-config__introbar">
          <div className="eee-config__intro">
            <h2 className="eee-config__title">{title}</h2>
            <p>{intro}</p>
          </div>
          <div className="eee-config__mode" role="radiogroup" aria-label="Match type">
            <label className="eee-config__mode-opt eee-config__mode-opt--exact">
              <input type="radio" name="eee-mm" checked={form.m === "exact"} onChange={() => set("m", "exact")} />
              <span><i aria-hidden="true" />Exact match</span>
            </label>
            <label className="eee-config__mode-opt eee-config__mode-opt--approx">
              <input type="radio" name="eee-mm" checked={form.m === "approx"} onChange={() => set("m", "approx")} />
              <span><i aria-hidden="true" />Approximate <small>{tolTxt}</small></span>
            </label>
          </div>
        </div>

        <form className="eee-config__form" noValidate onSubmit={(e) => e.preventDefault()}>
          <div className="eee-config__field">
            <label htmlFor="eee-current">Rated current <span className="eee-config__unit">[A]</span></label>
            <input id="eee-current" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 250"
              value={form.i} onChange={(e) => set("i", e.target.value)} />
            <small>Minimum — products rated at or above this current</small>
          </div>
          <div className="eee-config__field">
            <label htmlFor="eee-voltage">Rated voltage <span className="eee-config__unit">[V]</span></label>
            <div className="eee-config__combo">
              <input id="eee-voltage" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 800"
                value={form.v} onChange={(e) => set("v", e.target.value)} />
              <select aria-label="Voltage type" value={form.vt} onChange={(e) => set("vt", e.target.value as FormState["vt"])}>
                <option value="">AC or DC</option><option value="DC">DC</option><option value="AC">AC</option>
              </select>
            </div>
            <small>Minimum — products rated at or above this voltage</small>
          </div>
          <div className="eee-config__field">
            <label htmlFor="eee-breaking">Breaking capacity <span className="eee-config__unit">[A]</span></label>
            <input id="eee-breaking" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 30000"
              value={form.b} onChange={(e) => set("b", e.target.value)} />
            <small>
              {breakingRule === "max" ? "Maximum — products with a breaking capacity up to this value"
                : "Maximum fault current to interrupt — products able to break at least this current"}
              {criteria.b != null ? ` (= ${fmt(criteria.b / 1000)} kA)` : ""}
            </small>
          </div>
          <div className="eee-config__field">
            <label htmlFor="eee-loss">Power loss <span className="eee-config__unit">[W]</span></label>
            <input id="eee-loss" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 40"
              value={form.l} onChange={(e) => set("l", e.target.value)} />
            <small>{lossRule === "min" ? "Minimum — products dissipating at least this power" : "Maximum — products dissipating at most this power at rated current"}</small>
          </div>

          <fieldset className="eee-config__field eee-config__field--wide">
            <legend>Product type</legend>
            <div className="eee-config__chips">{chipRow("ct", options.ct)}</div>
          </fieldset>
          <fieldset className="eee-config__field eee-config__field--wide">
            <legend>Protection class <span className="eee-config__unit">(utilization category)</span></legend>
            <div className="eee-config__chips">{chipRow("pc", options.pc)}</div>
          </fieldset>

          <details className="eee-config__more-filters eee-config__field--wide" open={moreOpen}
            onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>More filters for EV &amp; battery storage <span className="eee-config__unit">time constant, I²t, mounting, size, application</span></summary>
            <div className="eee-config__form eee-config__form--nested">
              <div className="eee-config__field">
                <label htmlFor="eee-tc">Circuit time constant L/R <span className="eee-config__unit">[ms]</span></label>
                <input id="eee-tc" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 3"
                  value={form.tc} onChange={(e) => set("tc", e.target.value)} />
                <small>Products whose DC breaking capacity was tested at this time constant or higher</small>
              </div>
              <div className="eee-config__field">
                <label htmlFor="eee-i2t">Clearing I²t <span className="eee-config__unit">[A²s]</span></label>
                <input id="eee-i2t" type="number" inputMode="decimal" min={0} step="any" placeholder="e.g. 500000"
                  value={form.i2} onChange={(e) => set("i2", e.target.value)} />
                <small>Maximum — let-through energy your semiconductors or busbars can withstand</small>
              </div>
              <div className="eee-config__field">
                <label htmlFor="eee-size">Size code</label>
                <select id="eee-size" value={form.sz} onChange={(e) => set("sz", e.target.value)}>
                  <option value="">Any size</option>
                  {options.sz.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <small>As printed in the datasheet, e.g. 00, 1, 2XL</small>
              </div>
              <fieldset className="eee-config__field eee-config__field--wide">
                <legend>Mounting</legend>
                <div className="eee-config__chips">{chipRow("mt", options.mt)}</div>
              </fieldset>
              <fieldset className="eee-config__field eee-config__field--wide">
                <legend>Application</legend>
                <div className="eee-config__chips">{chipRow("ap", options.ap)}</div>
              </fieldset>
            </div>
          </details>

          <div className="eee-config__actions eee-config__field--wide">
            <label className="eee-config__check">
              <input type="checkbox" checked={form.inc} onChange={(e) => set("inc", e.target.checked)} />
              <span>Also list products with incomplete data for the selected criteria</span>
            </label>
            <button type="button" className="eee-config__reset" onClick={reset}>Clear criteria</button>
          </div>
        </form>

        <div className="eee-config__results" aria-live="polite">
          {loadError ? (
            <div className="eee-config__empty"><p>The product catalog could not be loaded. Please refresh the page, or{" "}
              <button type="button" className="eee-config__linkbtn" onClick={() => openRequest(null)}>send us your requirements</button>.</p></div>
          ) : products == null ? (
            <div className="eee-config__empty"><p>Loading the product catalog…</p></div>
          ) : !active && !showAll ? (
            <div className="eee-config__empty">
              <p>Enter one or more criteria to list the matching products.</p>
              <button type="button" className="eee-config__more" onClick={() => setShowAll(true)}>Browse all {all.length} products</button>
            </div>
          ) : (
            <>
              <div className="eee-config__summary"><p>
                <span className="eee-config__count eee-config__count--exact"><strong>{result.pass}</strong> exact match{result.pass === 1 ? "" : "es"}</span>
                {criteria.m === "approx" && <> · <span className="eee-config__count eee-config__count--approx"><strong>{result.approx}</strong> approximate (within {tolTxt})</span></>}
                {result.unknown > 0 && (criteria.inc
                  ? <> · <span className="eee-config__muted">{result.unknown} more with incomplete data shown below them</span></>
                  : <> · <button type="button" className="eee-config__linkbtn" onClick={() => set("inc", true)}>{result.unknown} more with incomplete data</button></>)}
              </p></div>

              {result.rows.length === 0 ? (
                <div className="eee-config__empty"><p>No product meets all criteria.{" "}
                  {criteria.m === "approx" ? "Try relaxing one value" : "Try the Approximate match, or relax one value"} — or{" "}
                  <button type="button" className="eee-config__linkbtn" onClick={() => openRequest(null)}>send us your requirements</button>.</p></div>
              ) : (
                <>
                  <div className="eee-config__table-wrap">
                    <table className="eee-config__table">
                      <thead><tr>
                        {COLS.map((col) => col.key === "ds" ? <th key={col.key} scope="col">{col.label}</th> : (
                          <th key={col.key} scope="col" aria-sort={sort.key === col.key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                            <button type="button" onClick={() => sortBy(col.key as SortKey)}>
                              {col.label}<span aria-hidden="true">{sort.key === col.key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}</span>
                            </button>
                          </th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {shown.map(({ p, idx, res }) => {
                          const cls = res.r === "unknown" ? "is-incomplete" : !active ? "" : res.r === "approx" ? "is-approx" : "is-exact";
                          const mech = [p.sz ? `Size ${p.sz}` : "", p.mt ? p.mt + (p.md ? ` (${p.md})` : "") : ""].filter(Boolean).join(" · ");
                          const cur = !p.i ? "" : p.i[0] == null ? `≤ ${fmt(p.i[1])} A` : p.i[0] === p.i[1] ? `${fmt(p.i[0])} A` : `${fmt(p.i[0])}–${fmt(p.i[1])} A`;
                          return (
                            <tr key={idx} className={cls}>
                              <td data-label="Reference">
                                {p.u
                                  ? <a className="eee-config__ref" href={productHref(p.u)} target="_blank" rel="noopener">{p.r}</a>
                                  : <button type="button" className="eee-config__ref eee-config__ref--ask" title="Ask EEE Tech about this product" onClick={() => openRequest(p)}>{p.r}</button>}
                                {p.s && norm(p.s) !== norm(p.r) && <span className="eee-config__sub">Series {p.s}</span>}
                                {mech && <span className="eee-config__sub">{mech}</span>}
                                {res.r === "unknown" && <span className="eee-config__flag">No data: {res.missing.join(", ")}</span>}
                                {res.dev.length > 0 && (
                                  <span className="eee-config__dev">Within {tolTxt}: {res.dev.map((d) =>
                                    `${d.label} ${d.pct > 0 ? "+" : "−"}${fmt(Math.abs(Math.round(d.pct * 10) / 10))} %`).join(", ")}</span>
                                )}
                              </td>
                              <td data-label="Category">{p.c || dash}{p.app && <span className="eee-config__sub">{p.app}</span>}</td>
                              <td data-label="Protection class">{p.p ? <span className="eee-config__tag">{p.p}</span> : dash}</td>
                              <td data-label="Rated voltage" className="is-num">
                                {p.v?.length ? p.v.map(([t, x], k) => <span key={k} className="eee-config__line">{t !== "?" ? t + " " : ""}{fmt(x)} V</span>) : dash}
                              </td>
                              <td data-label="Rated current" className="is-num">{cur || dash}</td>
                              <td data-label="Breaking capacity" className="is-num">
                                {p.b == null ? dash : <>{fmt(p.b)} kA{p.tc && <span className="eee-config__sub">τ {p.tc[0] === p.tc[1] ? fmt(p.tc[0]) : `${fmt(p.tc[0])}–${fmt(p.tc[1])}`} ms</span>}</>}
                              </td>
                              <td data-label="Power loss" className="is-num">
                                {p.l == null ? dash : <>{fmt(p.l)} W{p.lc && <span className="eee-config__sub">{p.lc}</span>}</>}
                              </td>
                              <td data-label="I²t clearing" className="is-num">
                                {p.i2 == null ? dash : <>{fmt(p.i2)} A²s{p.i2p != null && <span className="eee-config__sub">pre-arc {fmt(p.i2p)}</span>}</>}
                              </td>
                              <td data-label="Datasheet">
                                {p.ds ? (
                                  <a className="eee-config__ds" href={p.ds} target="_blank" rel="noopener" aria-label={`Datasheet for ${p.r} (PDF, opens in a new tab)`}>
                                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h6.5L15.5 6.5v11h-10.5z M11.5 2.5v4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7.5 11h5M7.5 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>PDF
                                  </a>
                                ) : dash}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {result.rows.length > shown.length && (
                    <button type="button" className="eee-config__more" onClick={() => setLimit((n) => n + pageSize)}>
                      Show {Math.min(pageSize, result.rows.length - shown.length)} more ({result.rows.length - shown.length} remaining)
                    </button>
                  )}
                </>
              )}
              {updated && <p className="eee-config__updated">Catalog updated {updated.replace("T", " ").replace("Z", " UTC")}</p>}
            </>
          )}
        </div>
      </div>

      <dialog className="eee-config__dialog" ref={dialogRef} aria-labelledby="eee-dialog-title"
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}>
        {req && (
          <form className="eee-config__mail" onSubmit={submitRequest} key={req.subject}>
            <div className="eee-config__mail-head">
              <div>
                <p className="eee-config__eyebrow">Request information</p>
                <h2 id="eee-dialog-title">{req.product ? req.product.r : "Your requirements"}</h2>
              </div>
              <button type="button" className="eee-config__close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <p className="eee-config__mail-to">To: EEE Tech sales · {contactEmail}</p>
            <div className="eee-config__mail-grid">
              <label>Name<input name="name" autoComplete="name" required /></label>
              <label>E-mail<input name="email" type="email" autoComplete="email" required spellCheck={false} autoCapitalize="off" /></label>
              <label>Company<input name="company" autoComplete="organization" /></label>
              <label>Quantity / year<input name="quantity" inputMode="numeric" /></label>
            </div>
            <input name="website" tabIndex={-1} autoComplete="off" className="eee-config__hp" aria-hidden="true" />
            <label className="eee-config__mail-body">Message<textarea name="message" rows={6} required defaultValue={req.body} /></label>
            {sendError && (
              <p className="eee-config__error">The request could not be sent. Please try again, or use the link below to write from your e-mail app.</p>
            )}
            <div className="eee-config__mail-foot">
              <a href={mailto} className="eee-config__mailto">Open in my e-mail app instead</a>
              <button type="submit" className="eee-config__send" disabled={sending}>{sending ? "Sending…" : "Send request"}</button>
            </div>
          </form>
        )}
      </dialog>

      {toast && <p className="eee-config__toast" role="status">{toast}</p>}
    </section>
  );
}
