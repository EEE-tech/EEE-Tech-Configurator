// EEE Tech Configurator — Lovable Cloud (Supabase) edge function.
//
//   GET  /eee-configurator/catalog            -> the latest catalog.json (public)
//   PUT  /eee-configurator/catalog            -> replace the catalog          (sync job, Bearer CONFIGURATOR_SYNC_TOKEN)
//   PUT  /eee-configurator/datasheet/<file>   -> store a datasheet PDF        (sync job, Bearer CONFIGURATOR_SYNC_TOKEN)
//   POST /eee-configurator/request            -> a visitor's product request: saved + e-mailed (public)
//
// Secrets: CONFIGURATOR_SYNC_TOKEN (any long random string, same as in the sync job)
//          RESEND_API_KEY, REQUEST_TO_EMAIL, REQUEST_FROM_EMAIL (optional: e-mail the requests)
// Storage: public bucket "configurator".  Table: configurator_requests (optional, see LOVABLE.md).
// Deploy with JWT verification off (verify_jwt = false): the page calls it without a signed-in user.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "configurator";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function authorized(req: Request) {
  const token = Deno.env.get("CONFIGURATOR_SYNC_TOKEN");
  return !!token && req.headers.get("authorization") === `Bearer ${token}`;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const path = new URL(req.url).pathname.replace(/^.*\/eee-configurator/, "") || "/";

  try {
    // ---------- catalog ----------
    if (path === "/catalog" && req.method === "GET") {
      const { data, error } = await supabase.storage.from(BUCKET).download("catalog.json");
      if (error || !data) return json({ error: "No catalog published yet" }, 404);
      return new Response(await data.text(), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
    }
    if (path === "/catalog" && req.method === "PUT") {
      if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
      const body = await req.text();
      const parsed = JSON.parse(body);
      if (!Array.isArray(parsed.products)) return json({ error: "Expected { products: [...] }" }, 400);
      const { error } = await supabase.storage.from(BUCKET).upload("catalog.json", new Blob([body], { type: "application/json" }),
        { upsert: true, contentType: "application/json", cacheControl: "60" });
      if (error) throw error;
      return json({ ok: true, count: parsed.products.length });
    }

    // ---------- datasheets ----------
    if (path.startsWith("/datasheet/") && req.method === "PUT") {
      if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
      const name = decodeURIComponent(path.slice("/datasheet/".length)).replace(/[^A-Za-z0-9._-]+/g, "-");
      if (!name.toLowerCase().endsWith(".pdf")) return json({ error: "PDF only" }, 400);
      const key = `datasheets/${name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(key, await req.arrayBuffer(),
        { upsert: true, contentType: "application/pdf", cacheControl: "86400" });
      if (error) throw error;
      return json({ url: supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl });
    }

    // ---------- visitor requests ----------
    if (path === "/request" && req.method === "POST") {
      const r = await req.json();
      if (r.website) return json({ ok: true }); // honeypot filled: a bot
      const email = String(r.email ?? "").trim();
      const name = String(r.name ?? "").trim();
      const message = String(r.message ?? "").trim();
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message || message.length > 10000) {
        return json({ error: "Name, a valid e-mail and a message are required" }, 400);
      }
      const row = {
        name, email, message,
        company: String(r.company ?? "").slice(0, 200) || null,
        quantity: String(r.quantity ?? "").slice(0, 100) || null,
        reference: r.reference ? String(r.reference).slice(0, 200) : null,
        series: r.series ? String(r.series).slice(0, 200) : null,
        criteria: r.criteria ? String(r.criteria).slice(0, 2000) : null,
        page: r.page ? String(r.page).slice(0, 1000) : null,
      };
      const stored = !(await supabase.from("configurator_requests").insert(row)).error;

      let mailed = false;
      const key = Deno.env.get("RESEND_API_KEY");
      const to = Deno.env.get("REQUEST_TO_EMAIL");
      if (key && to) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("REQUEST_FROM_EMAIL") ?? "EEE Tech Configurator <onboarding@resend.dev>",
            to: to.split(",").map((s) => s.trim()),
            reply_to: email,
            subject: String(r.subject ?? `Configurator request${row.reference ? " for " + row.reference : ""}`).slice(0, 200),
            html: `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt;${row.company ? " — " + esc(row.company) : ""}</p>
              <p><b>Reference:</b> ${esc(row.reference ?? "—")}${row.series ? " (series " + esc(row.series) + ")" : ""}<br>
              <b>Quantity / year:</b> ${esc(row.quantity ?? "—")}<br>
              <b>Criteria:</b> ${esc(row.criteria ?? "—")}</p>
              <pre style="font:inherit;white-space:pre-wrap">${esc(message)}</pre>
              <p style="color:#777">Sent from ${esc(row.page ?? "the EEE Tech Configurator")}</p>`,
          }),
        });
        mailed = res.ok;
      }
      if (!stored && !mailed) return json({ error: "Request could not be delivered" }, 500);
      return json({ ok: true, stored, mailed });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
