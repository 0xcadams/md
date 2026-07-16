import {describe, expect, test} from "bun:test";

import app from "./vercel.js";

describe("Vercel entrypoint", () => {
  test("serves the bundled demo workspace", async () => {
    const response = await app.request("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Directory contents");
    expect(body).toContain("Welcome to the <strong>md</strong> demo!");
    expect(body).toContain('href="/example.ts"');
  });
});
