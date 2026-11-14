import { cp, mkdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const rootFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "bandwidth-account.js",
  "admin-console.js",
  "manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "_headers"
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

for (const file of rootFiles) {
  await cp(file, `dist/${file}`);
}

await cp("assets", "dist/assets", { recursive: true });

// Fail the build if the page references a local script, stylesheet or icon that was not shipped.
const html = await readFile("dist/index.html", "utf8");
const referenced = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map(match => match[1]);
const missing = [...new Set(referenced)].filter(path => !existsSync(`dist/${path}`));
if (missing.length) {
  console.error(`index.html references files missing from dist: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("DataX Pages assets prepared in ./dist");
