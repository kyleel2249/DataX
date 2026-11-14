import { cp, mkdir, rm } from "node:fs/promises";

const rootFiles = [
  "index.html",
  "styles.css",
  "app.js",
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

console.log("DataX Pages assets prepared in ./dist");
