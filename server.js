// Zero-dependency static server for Render (no npm packages to break the build).
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".woff2": "font/woff2", ".mp4": "video/mp4"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (urlPath === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) file = path.join(ROOT, "index.html"); // fallback to the site

  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=604800",
    "X-Content-Type-Options": "nosniff"
  };

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); return res.end("Server error"); }
    const compressible = [".html", ".css", ".js", ".json", ".svg", ".txt", ".xml"].includes(ext);
    if (compressible && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      headers["Content-Encoding"] = "gzip";
      data = zlib.gzipSync(data);
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log("JHcarpenters running on port " + PORT));
