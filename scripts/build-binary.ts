import {mkdir, readdir, readFile, rm} from "node:fs/promises";
import path from "node:path";

interface PackageMetadata {
  version: string;
}

const metadata = JSON.parse(await readFile("package.json", "utf8")) as PackageMetadata;
const target = process.env.MD_TARGET as Bun.Build.CompileTarget | undefined;
const isWindows = target?.includes("windows") ?? process.platform === "win32";
const extension = isWindows ? ".exe" : "";
const output = path.resolve(process.env.MD_OUTFILE ?? `dist/md${extension}`);
const version = process.env.MD_BUILD_VERSION ?? metadata.version;

async function removeCompilerArtifacts(): Promise<void> {
  const entries = await readdir(".");
  await Promise.all(
    entries
      .filter((entry) => /^\..+\.bun-build$/.test(entry))
      .map((entry) => rm(entry, {force: true})),
  );
}

await mkdir(path.dirname(output), {recursive: true});

const compile: Bun.CompileBuildOptions = {
  autoloadBunfig: false,
  autoloadDotenv: false,
  autoloadPackageJson: false,
  autoloadTsconfig: false,
  outfile: output,
};
if (target !== undefined) compile.target = target;

let result: Bun.BuildOutput;
try {
  result = await Bun.build({
    compile,
    define: {MD_BUILD_VERSION: JSON.stringify(version)},
    entrypoints: ["src/index.ts"],
    minify: true,
    packages: "bundle",
    target: "bun",
    tsconfig: "tsconfig.json",
  });
} finally {
  await removeCompilerArtifacts();
}

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${output} for ${target ?? "the current platform"}`);
