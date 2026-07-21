<p align="center">
  <img src="logo.svg" alt="md" width="96" height="96">
</p>

`md` is a minimal server for viewing markdown and code.

Point it at a directory and open the URL it prints. Directories look like GitHub: files first, then `README.md` or `INDEX.md`. Markdown and source code are rendered with Shiki.

[Try the demo](https://md.cadams.io).

## Install

[Download and extract the latest release](https://github.com/0xcadams/md/releases/latest) for your system, then run it from the extracted folder:

```bash
./md /path/to/files
```

Open `http://127.0.0.1:8080`.

The binary is self-contained. Git metadata appears when `git` is available.

## Docker

```bash
docker run --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 8080:8080 \
  --mount type=bind,src="$PWD",dst=/data,readonly \
  ghcr.io/0xcadams/md@sha256:da118717e18e8f1d8008ce1d7f4b4175462f38c1055d15fd6aab3ae559d93114
```

## Features

- GitHub Flavored Markdown and Shiki syntax highlighting
- GitHub-style listings, working-tree diffs, and linkable source lines
- Selectable light and dark Shiki themes
- Mermaid, wiki links, and GitHub alerts
- Raw files at `/raw/<path>`
- Read-only filesystem confinement

## Develop

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run dev -- ./demo-files
```

Run the checks and build the standalone binary:

```bash
bun run check
bun test
bun run binary
```

## License

[Unlicense](LICENSE)
