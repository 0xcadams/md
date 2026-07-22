import path from "node:path";

export interface Config {
  cssPath?: string;
  help: boolean;
  host: string;
  port: number;
  root: string;
  version: boolean;
}

export class UsageError extends Error {}

function readOptionValue(
  args: readonly string[],
  index: number,
  inline?: string,
): [string, number] {
  if (inline !== undefined) return [inline, index];
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`missing value for ${args[index]}`);
  return [value, index + 1];
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new UsageError(`invalid port: ${value}`);
  }
  return port;
}

export function parseConfig(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = Bun.env,
  cwd = process.cwd(),
): Config {
  let host = env.PERUSE_HOST ?? "127.0.0.1";
  let port = parsePort(env.PORT ?? "8080");
  let cssPath: string | undefined;
  let help = false;
  let version = false;
  let optionsEnded = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (optionsEnded || !argument.startsWith("-") || argument === "-") {
      positional.push(argument);
      continue;
    }
    if (argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      version = true;
      continue;
    }

    const [option, inline] = argument.split("=", 2);
    if (option === "--port" || option === "-p") {
      const [value, consumed] = readOptionValue(args, index, inline);
      port = parsePort(value);
      index = consumed;
      continue;
    }
    if (option === "--host") {
      const [value, consumed] = readOptionValue(args, index, inline);
      host = value;
      index = consumed;
      continue;
    }
    if (option === "--css" || option === "-c") {
      const [value, consumed] = readOptionValue(args, index, inline);
      cssPath = path.resolve(cwd, value);
      index = consumed;
      continue;
    }
    throw new UsageError(`unknown option: ${argument}`);
  }

  if (positional.length > 1) {
    throw new UsageError("only one directory can be served at a time");
  }

  const config: Config = {
    help,
    host,
    port,
    root: path.resolve(cwd, positional[0] ?? "."),
    version,
  };
  if (cssPath !== undefined) config.cssPath = cssPath;
  return config;
}

export const usage = `Usage: peruse [options] [directory]

Options:
  -p, --port <port>  Port to listen on (default: 8080 or PORT)
      --host <host>  Interface to bind (default: 127.0.0.1)
  -c, --css <path>   Append a custom stylesheet
  -v, --version      Print version and exit
  -h, --help         Show this help`;
