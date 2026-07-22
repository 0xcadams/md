<p align="center">
  <img src="logo.svg" alt="Peruse" width="96" height="96">
</p>

<h1 align="center">Peruse</h1>

Peruse is a minimal server for viewing Markdown and code, with Git metadata and working-tree changes.

Point it at a directory and open the URL it prints. Directories look like GitHub: folders and files first, then `README.md` or `INDEX.md`. Markdown uses GFM, and code is highlighted with Shiki.

[Try the demo](https://peruse.cadams.io).

## Install

Install with Homebrew:

```bash
brew install 0xcadams/tap/peruse
```

Or [download and extract the latest release](https://github.com/0xcadams/peruse/releases/latest) for macOS, Linux, or Windows. The binaries are self-contained.

## Run Peruse

```bash
peruse /path/to/files
```

Open `http://127.0.0.1:8080`. Run `peruse` without a directory to serve the current directory.

## Configure

- `-p, --port <port>` or `PORT` sets the port.
- `--host <host>` or `PERUSE_HOST` sets the interface.
- `-c, --css <path>` appends a custom stylesheet.

Run `peruse --help` for full usage.

## Docker

```bash
docker run --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 8080:8080 \
  --mount type=bind,src="$PWD",dst=/data,readonly \
  ghcr.io/0xcadams/peruse@sha256:d71f927f308ef4e32d116fd12f078e85c9125e78eac45e90cc5ddb2e3a210fdc
```

Open `http://127.0.0.1:8080`.

## Features

- GFM, Mermaid, wiki links, and GitHub alerts
- Shiki highlighting with selectable light and dark themes
- Linkable source lines and ranges
- Git history and working-tree changes when Git is available
- Raw files at `/raw/<path>`

## Security

> [!WARNING]
> Peruse does not provide authentication or TLS. Keep the default loopback binding unless access is controlled by a trusted network or reverse proxy.

Peruse has no write routes, confines served paths to the selected root, and never serves `.git`. The native process still has your user's read permissions and is not a sandbox.

## Develop

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run dev -- ./demo-files
```

Regenerate the demo Git snapshot with `bun run generate:demo-git`.

```bash
bun run check
bun run test
bun run binary
```

## License

[Unlicense](LICENSE)
