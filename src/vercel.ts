import path from "node:path";

import {Hono} from "hono";

import {createApp} from "./app.js";

const app: Hono = await createApp({
  assetDirectory: path.resolve("public/assets"),
  root: path.resolve("demo-files"),
});

if (!(app instanceof Hono)) throw new TypeError("createApp did not return a Hono application");

export default app;
