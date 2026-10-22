#!/usr/bin/env node
// Serves web/ for working on the app locally: npm start, then open
// http://127.0.0.1:8846/. The published site is plain GitHub Pages; this
// only stands in for it.
//
//   node scripts/serve.js [--host 127.0.0.1] [--port 8846]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { host: { type: "string" }, port: { type: "string" } } });
const HOST = args.host ?? "127.0.0.1";
const PORT = Number(args.port ?? 8846);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return res.writeHead(400).end();
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, body) => {
    if (err) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    // Revalidate every load, so an edit shows up on the next reload
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  });
}).listen(PORT, HOST, () => {
  console.log(`Screen:   http://${HOST}:${PORT}/`);
  console.log(`Settings: http://${HOST}:${PORT}/settings.html`);
});
