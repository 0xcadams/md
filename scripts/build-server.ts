const result = await Bun.build({
  entrypoints: ["src/vercel.ts"],
  external: ["hono", "hono/*"],
  format: "esm",
  naming: "server.js",
  outdir: ".",
  packages: "bundle",
  target: "node",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
