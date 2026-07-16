#!/usr/bin/env bun
import {readFile} from "node:fs/promises";

import {createApp} from "./app.js";
import {parseConfig, usage, UsageError} from "./config.js";
import {embeddedAssets} from "./embedded-assets.js";

declare const MD_BUILD_VERSION: string | undefined;

const compiledVersion = typeof MD_BUILD_VERSION === "string" ? MD_BUILD_VERSION : undefined;
const version = Bun.env.MD_VERSION ?? compiledVersion ?? "dev";

async function main(): Promise<void> {
  let config;
  try {
    config = parseConfig(Bun.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`md: ${error.message}\n\n${usage}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (config.help) {
    console.log(usage);
    return;
  }
  if (config.version) {
    console.log(`md ${version}`);
    return;
  }

  const customCss =
    config.cssPath === undefined ? undefined : await readFile(config.cssPath, "utf8");
  const appOptions: Parameters<typeof createApp>[0] = {assets: embeddedAssets, root: config.root};
  if (customCss !== undefined) appOptions.customCss = customCss;
  const app = await createApp(appOptions);
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: config.host,
    idleTimeout: 30,
    port: config.port,
  });

  const displayHost = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
  console.log(`md ${version} serving ${config.root} at http://${displayHost}:${server.port}`);

  const shutdown = (): void => {
    void server.stop(false);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? `md: ${error.message}` : error);
  process.exitCode = 1;
});
