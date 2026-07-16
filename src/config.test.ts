import {describe, expect, test} from "bun:test";
import path from "node:path";

import {parseConfig, UsageError} from "./config.js";

describe("parseConfig", () => {
  test("uses local defaults", () => {
    expect(parseConfig([], {}, "/tmp/docs")).toEqual({
      help: false,
      host: "127.0.0.1",
      port: 8080,
      root: "/tmp/docs",
      version: false,
    });
  });

  test("accepts flags before and after the directory", () => {
    expect(parseConfig(["notes", "--port", "3000", "--host=0.0.0.0"], {}, "/tmp")).toEqual({
      help: false,
      host: "0.0.0.0",
      port: 3000,
      root: path.resolve("/tmp/notes"),
      version: false,
    });
  });

  test("reads container-friendly environment values", () => {
    const config = parseConfig([], {MD_HOST: "::", PORT: "9000"}, "/tmp");
    expect(config.host).toBe("::");
    expect(config.port).toBe(9000);
  });

  test("rejects invalid arguments", () => {
    expect(() => parseConfig(["--port", "0"])).toThrow(UsageError);
    expect(() => parseConfig(["--unknown"])).toThrow("unknown option");
    expect(() => parseConfig(["one", "two"])).toThrow("only one directory");
  });
});
