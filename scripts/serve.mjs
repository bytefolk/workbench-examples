import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (req, res) => {
    try {
      const requested = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const parts = requested.split("/");
      if (
        parts.some((part) => part.startsWith(".") || part === "node_modules") ||
        requested.includes("\\")
      ) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      let target = path.resolve(root, `.${requested}`);
      const requestedRelative = path.relative(root, target);
      if (
        requestedRelative.startsWith("..") ||
        path.isAbsolute(requestedRelative)
      ) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if ((await fs.stat(target)).isDirectory())
        target = path.join(target, "index.html");
      const realTarget = await fs.realpath(target);
      const relative = path.relative(await fs.realpath(root), realTarget);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const content = await fs.readFile(realTarget);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(content);
    } catch (error) {
      const status = ["ENOENT", "ENOTDIR"].includes(error.code) ? 404 : 400;
      res.writeHead(status).end(status === 404 ? "Not found" : "Bad request");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Workbench Examples: http://127.0.0.1:${port}`),
  );
