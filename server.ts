import {fileURLToPath} from "node:url";

import {createApp} from "./src/app";

const app = await createApp({
  assetDirectory: fileURLToPath(new URL("./public/assets/", import.meta.url)),
  root: fileURLToPath(new URL("./demo-files/", import.meta.url)),
});

export default app;
