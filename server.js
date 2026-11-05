// Zero-dependency Node server for Render: serves the site, /healthz and POST /api/contact.
const http = require("http"), fs = require("fs"), path = require("path"), zlib = require("zlib");
const PORT = process.env.PORT || 10000;
const TO = process.env.CONTACT_TO || "hachem.joseph@yahoo.com";
const ROOTS = [__dirname, path.join(__dirname, "public")].filter(r => fs.existsSync(r)); // files may sit in the repo root or in /public
console.log("Looking for site files in:", ROOTS.join(" , "), "| index.html:", ROOTS.filter(r => fs.existsSync(path.join(r, "index.html"))).join(" , ") || "NOT FOUND");
const TYPES = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".json":"application/json", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".webp":"image/webp",
  ".svg":"image/svg+xml", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8", ".xml":"application/xml" };
const PRIVATE = /^(server\.js|package(-lock)?\.json|render\.yaml|\.gitignore|readme.*)$/i;
const hits = new Map();
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

function contact(req, res) {
  let body = "";
  req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
  req.on("end", async () => {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 600000);
    if (recent.length >= 5) return json(res, 429, { ok: false });
    recent.push(now); hits.set(ip, recent);
    let d; try { d = JSON.parse(body); } catch { return json(res, 400, { ok: false }); }
    if (d.company) return json(res, 200, { ok: true }); // honeypot: bots only
    const c = v => String(v || "").trim().slice(0, 3000);
    const m = { name: c(d.name), phone: c(d.phone), email: c(d.email), request: c(d.request), project: c(d.project), message: c(d.message) };
    if (!m.name || !m.message || !(m.phone || m.email)) return json(res, 400, { ok: false });
    try {
      const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(TO), {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ _subject: "Website inquiry: " + (m.request || "General") + " – " + m.name, _template: "table", _replyto: m.email || undefined, ...m })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) !== "true") throw new Error(JSON.stringify(j));
      json(res, 200, { ok: true });
    } catch (e) { console.error("Contact forward failed:", e.message); json(res, 502, { ok: false }); }
  });
}

function find(p) {
  if (PRIVATE.test(path.basename(p))) return null;
  for (const r of ROOTS) {
    const f = path.normalize(path.join(r, p));
    if (!f.startsWith(r)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http.createServer((req, res) => {
  let p = "/";
  try { p = decodeURIComponent((req.url || "/").split("?")[0]); } catch { res.writeHead(400); return res.end("Bad request"); }
  if (p === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  if (p === "/version") { const f = find("/index.html"); return json(res, 200, { build: 6, index: f && path.relative(__dirname, f), indexBytes: f && fs.statSync(f).size, images: ROOTS.flatMap(r => fs.readdirSync(r).filter(n => /^jh-/.test(n))) }); }
  if (req.method === "POST" && p === "/api/contact") return contact(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let file = find(p === "/" ? "/index.html" : p) || (path.extname(p) ? null : find("/index.html"));
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found: " + p); }
  const ext = path.extname(file).toLowerCase();
  const h = { "Content-Type": TYPES[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=604800" };
  fs.readFile(file, (err, data) => {
    if (err) { console.error("Read failed:", file, err.code); res.writeHead(500, { "Content-Type": "text/plain" }); return res.end("Server error: could not read " + path.basename(file)); }
    if ([".html", ".css", ".js", ".json", ".svg", ".txt", ".xml"].includes(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) { h["Content-Encoding"] = "gzip"; data = zlib.gzipSync(data); }
    res.writeHead(200, h); res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log("JHcarpenters running on port " + PORT));
