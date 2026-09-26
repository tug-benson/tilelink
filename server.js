/* TileLink backend — zero dependencies (Node stdlib only).
 * - Serves static files (public read for everyone)
 * - Write API restricted to admins (Bearer ADMIN_TOKEN):
 *     GET    /api/status          -> { authRequired }
 *     POST   /api/verify  {token} -> { ok }
 *     GET    /api/links           -> { links } (UI-created tiles)
 *     POST   /api/links    {name, url, icon?, category?, env?} -> { link }
 *     PUT    /api/links/:id       (UI tile update)
 *     DELETE /api/links/:id
 *     GET    /api/settings        -> { settings } (branding admin)
 *     PUT    /api/settings {title?, subtitle?, logo?} (empty = config.yaml fallback)
 *     POST   /api/upload   {filename, dataUrl} -> { path }
 *       dataUrl = 256x256 PNG generated in the browser (canvas).
 * - Storage: custom.json (never config.yaml, which stays hand-editable)
 *   + icons/ for uploaded images.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || "3000", 10);
const TOKEN = process.env.ADMIN_TOKEN || "";
const DATA_FILE = path.join(ROOT, "custom.json");
const ICONS_DIR = path.join(ROOT, "icons");
const BODY_LIMIT = 2 * 1024 * 1024; // 2 MB (256px PNG ~= tens of KB)
const MAX_IMG_BYTES = 1024 * 1024; // 1 MB
const MAX_IMG_DIM = 512; // guardrail (frontend sends 256)
const CDN_SVG = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/";
const CDN_PNG = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};
// Files never served (source code, secrets)
const BLOCKED = new Set(["server.js", "package.json", "package-lock.json", ".env"]);

// ---------- utils ----------
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": buf.length,
  });
  res.end(buf);
}
function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error("Body too large (max 2 MB)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function bearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}
function authorized(req) {
  if (!TOKEN) return false; // no token configured: writes disabled
  const got = bearer(req);
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function slugify(s) {
  return (s || "icone")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "icone";
}
function isBareSlug(icon) {
  // slug dashboard-icons (ex: "sftpgo") vs URL directe / fichier local
  return icon && !/^(https?:\/\/|\/|\.\/|icons\/)/i.test(icon);
}
// dashboard-icons slug -> downloaded and pinned into icons/ (works offline afterwards).
// If the download fails, keep the CDN reference (resolved at display time).
async function resolveIcon(icon) {
  icon = (icon || "").trim();
  if (isBareSlug(icon)) {
    const cached = await cacheSlugIcon(icon);
    if (cached) return cached;
  }
  return icon;
}
// Cache a dashboard-icons slug into icons/ (svg, else png).
// Returns "icons/xxx.ext" or null (then keep the CDN reference).
async function cacheSlugIcon(slug) {
  const clean = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(clean)) return null;
  const cands = [
    { ext: "svg", url: CDN_SVG + clean + ".svg" },
    { ext: "png", url: CDN_PNG + clean + ".png" },
  ];
  for (const c of cands) {
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_IMG_BYTES) continue;
      if (c.ext === "svg") {
        if (!buf.subarray(0, 1024).toString("utf8").includes("<svg")) continue;
      } else if (checkPng(buf)) {
        continue;
      }
      await fsp.mkdir(ICONS_DIR, { recursive: true });
      const base = slugify(clean);
      let file = base + "." + c.ext;
      let i = 2;
      while (fs.existsSync(path.join(ICONS_DIR, file))) {
        file = base + "-" + i + "." + c.ext;
        i++;
        if (i > 100) return null;
      }
      await fsp.writeFile(path.join(ICONS_DIR, file), buf);
      return "icons/" + file;
    } catch (e) { /* next format / keep the CDN reference */ }
  }
  return null;
}

// ---------- custom.json : { links: [], settings: { title, subtitle, logo } ----------
// settings = admin overrides (empty string = config.yaml fallback)
function normSettings(s) {
  const out = {};
  if (s && typeof s === "object") {
    if (typeof s.title === "string") out.title = s.title.trim().slice(0, 60);
    if (typeof s.subtitle === "string") out.subtitle = s.subtitle.trim().slice(0, 120);
    if (typeof s.logo === "string") out.logo = s.logo.trim().slice(0, 500);
  }
  return out;
}
async function loadCustom() {
  const blank = { links: [], settings: {} };
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return blank;
    // Compat : ancien format tableau nu ou {links} sans settings
    const links = Array.isArray(data) ? data : (Array.isArray(data.links) ? data.links : []);
    return { links: links, settings: normSettings(data.settings) };
  } catch (e) {
    if (e.code === "ENOENT" || e instanceof SyntaxError) return blank;
    throw e;
  }
}
async function saveCustom(data) {
  // backup + atomic write (tmp + rename)
  try {
    await fsp.copyFile(DATA_FILE, DATA_FILE + ".bak");
  } catch (e) { /* first save: nothing to back up */ }
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmp = DATA_FILE + ".tmp";
  try {
    await fsp.writeFile(tmp, content, "utf8");
    await fsp.rename(tmp, DATA_FILE);
  } catch (e) {
    if (e.code === "EBUSY" || e.code === "EXDEV" || e.code === "EPERM") {
      // custom.json bind-mounted as a Docker volume: rename refused -> in-place write
      try { await fsp.unlink(tmp); } catch (ee) {}
      await fsp.writeFile(DATA_FILE, content, "utf8");
    } else {
      throw e;
    }
  }
}

// ---------- validation ----------
function checkLink(b) {
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!name || name.length > 80) return "Name required (1-80 characters)";
  if (!/^https?:\/\/\S+$/.test(url) || url.length > 500) return "Invalid URL (http(s)://… required)";
  const icon = b.icon === undefined || b.icon === null ? "" : String(b.icon).trim();
  if (icon.length > 500 || icon.includes("..")) return "Invalid icon";
  const category = b.category === undefined || b.category === null ? "" : String(b.category).trim();
  if (category.length > 40) return "Category too long (max 40)";
  const env = b.env === undefined || b.env === null ? "" : String(b.env).trim();
  if (env.length > 20) return "Env too long (max 20)";
  return null;
}
function checkSettings(b) {
  if (!b || typeof b !== "object") return "Invalid settings";
  for (const k of ["title", "subtitle", "logo"]) {
    if (b[k] !== undefined && typeof b[k] !== "string") return "Invalid " + k + " field";
  }
  if (b.title && b.title.trim().length > 60) return "Title too long (max 60)";
  if (b.subtitle && b.subtitle.trim().length > 120) return "Subtitle too long (max 120)";
  if (b.logo && (b.logo.trim().length > 500 || b.logo.includes(".."))) return "Invalid logo";
  return null;
}
function checkPng(buf) {
  // PNG signature + dimensions read from IHDR (no dependencies)
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return "Invalid PNG file";
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (!w || !h || w > MAX_IMG_DIM || h > MAX_IMG_DIM) {
    return "Invalid dimensions (max " + MAX_IMG_DIM + "x" + MAX_IMG_DIM + "px)";
  }
  return null;
}

// ---------- statique ----------
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const name = path.basename(safe);
  if (name.startsWith(".") || BLOCKED.has(name)) {
    send(res, 403, "Forbidden");
    return;
  }
  const file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      send(res, 403, "Forbidden");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (name === "config.yaml" || name === "custom.json") {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    }
    const data = await fsp.readFile(file);
    res.writeHead(200, { ...headers, "Content-Length": data.length });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT") send(res, 404, "Not found");
    else send(res, 500, "File read error");
  }
}

// ---------- routes ----------
async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  try {
    if (p === "/api/status" && req.method === "GET") {
      json(res, 200, { authRequired: TOKEN !== "", version: 1 });
      return;
    }
    if (p === "/api/verify" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      if (TOKEN && body.token === TOKEN) json(res, 200, { ok: true });
      else json(res, 401, { ok: false, error: "Incorrect password" });
      return;
    }
    if (p === "/api/links" && req.method === "GET") {
      const data = await loadCustom();
      json(res, 200, { links: data.links });
      return;
    }
    if (p === "/api/settings" && req.method === "GET") {
      const data = await loadCustom();
      json(res, 200, { settings: data.settings });
      return;
    }
    if (p === "/api/settings" && req.method === "PUT") {
      if (!authorized(req)) {
        json(res, 401, { error: "Unauthorized (admin token required)" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const err = checkSettings(body);
      if (err) {
        json(res, 400, { error: err });
        return;
      }
      const data = await loadCustom();
      data.settings = normSettings(body);
      await saveCustom(data);
      json(res, 200, { settings: data.settings });
      return;
    }
    if (p === "/api/links" && req.method === "POST") {
      if (!authorized(req)) {
        json(res, 401, { error: "Unauthorized (admin token required)" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const err = checkLink(body);
      if (err) {
        json(res, 400, { error: err });
        return;
      }
      const data = await loadCustom();
      const link = {
        id: "c" + Date.now().toString(36),
        name: body.name.trim(),
        url: body.url.trim(),
        icon: await resolveIcon(body.icon),
        category: (body.category || "").trim(),
        env: (body.env || "").trim(),
      };
      data.links.push(link);
      await saveCustom(data);
      json(res, 201, { link });
      return;
    }
    if (p.startsWith("/api/links/") && req.method === "PUT") {
      if (!authorized(req)) {
        json(res, 401, { error: "Unauthorized (admin token required)" });
        return;
      }
      const id = p.slice("/api/links/".length);
      const body = JSON.parse(await readBody(req));
      const err = checkLink(body);
      if (err) {
        json(res, 400, { error: err });
        return;
      }
      const data = await loadCustom();
      const idx = data.links.findIndex((l) => l.id === id);
      if (idx === -1) {
        json(res, 404, { error: "Tile not found" });
        return;
      }
      data.links[idx] = {
        id: id,
        name: body.name.trim(),
        url: body.url.trim(),
        icon: await resolveIcon(body.icon),
        category: (body.category || "").trim(),
        env: (body.env || "").trim(),
      };
      await saveCustom(data);
      json(res, 200, { link: data.links[idx] });
      return;
    }
    if (p.startsWith("/api/links/") && req.method === "DELETE") {      if (!authorized(req)) {
        json(res, 401, { error: "Unauthorized (admin token required)" });
        return;
      }
      const id = p.slice("/api/links/".length);
      const data = await loadCustom();
      const before = data.links.length;
      data.links = data.links.filter((l) => l.id !== id);
      if (data.links.length === before) {
        json(res, 404, { error: "Tile not found" });
        return;
      }
      await saveCustom(data);
      json(res, 200, { ok: true });
      return;
    }
    if (p === "/api/upload" && req.method === "POST") {
      if (!authorized(req)) {
        json(res, 401, { error: "Unauthorized (admin token required)" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const m = typeof body.dataUrl === "string" && body.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!m) {
        json(res, 400, { error: "Invalid image (PNG base64 expected — the browser already converts to 256px)" });
        return;
      }
      const buf = Buffer.from(m[1], "base64");
      if (buf.length > MAX_IMG_BYTES) {
        json(res, 400, { error: "Image too heavy (max 1 MB)" });
        return;
      }
      const pngErr = checkPng(buf);
      if (pngErr) {
        json(res, 400, { error: pngErr });
        return;
      }
      await fsp.mkdir(ICONS_DIR, { recursive: true });
      const base = slugify(body.filename || "icone");
      let file = base + ".png";
      let i = 2;
      while (fs.existsSync(path.join(ICONS_DIR, file))) {
        file = base + "-" + i + ".png";
        i++;
        if (i > 100) {
          json(res, 500, { error: "Too many same-named files" });
          return;
        }
      }
      await fsp.writeFile(path.join(ICONS_DIR, file), buf);
      json(res, 201, { path: "icons/" + file });
      return;
    }
    if (p.startsWith("/api/")) {
      json(res, 404, { error: "Unknown API route" });
      return;
    }
    await serveStatic(req, res, p);
  } catch (e) {
    if (e instanceof SyntaxError) json(res, 400, { error: "Invalid JSON" });
    else if (e.message && e.message.indexOf("Body too large") !== -1) {
      try { json(res, 413, { error: e.message }); } catch (ee) {}
    } else {
      console.error(e);
      // Detailed message on purpose (homelab) to diagnose from UI/logs
      try { json(res, 500, { error: "Server error: " + (e.code || e.message) }); } catch (ee) {}
    }
  }
}

http.createServer(handler).listen(PORT, () => {
  console.log("TileLink on :" + PORT + " | admin writes: " + (TOKEN ? "enabled" : "DISABLED (ADMIN_TOKEN not set)"));
  if (!TOKEN) console.log("Hint: set ADMIN_TOKEN in the docker-compose to enable adding via the UI.");
});
