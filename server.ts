import {fileURLToPath} from "node:url";

import {Hono} from "hono";

import {createApp} from "./src/app";

const app: Hono = await createApp({
  assetDirectory: fileURLToPath(new URL("./public/assets/", import.meta.url)),
  root: fileURLToPath(new URL("./demo-files/", import.meta.url)),
});

export default app;
