import {mkdir, rm} from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("public/assets");
await rm(outputDirectory, {force: true, recursive: true});
await mkdir(outputDirectory, {recursive: true});
await Bun.write(path.join(outputDirectory, "logo.svg"), Bun.file("logo.svg"));

const results = await Promise.all([
  Bun.build({
    entrypoints: ["src/client.ts"],
    minify: true,
    naming: "app.[ext]",
    outdir: outputDirectory,
    target: "browser",
  }),
  Bun.build({
    entrypoints: ["src/mermaid-client.ts"],
    minify: true,
    naming: "mermaid.[ext]",
    outdir: outputDirectory,
    target: "browser",
  }),
  Bun.build({
    entrypoints: ["src/styles.css"],
    minify: true,
    naming: "styles.[ext]",
    outdir: outputDirectory,
    target: "browser",
  }),
]);

for (const result of results) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}
