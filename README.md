<p align="center">
  <img src="logo.svg" alt="Peruse" width="96" height="96">
</p>

Peruse is a minimal server for viewing markdown and code.

Point it at a directory and open the URL it prints. Directories look like GitHub: files first, then `README.md` or `INDEX.md`. Markdown and source code are rendered with Shiki.

[Try the demo](https://peruse.cadams.io).

## Install

Install with Homebrew:

```bash
brew install 0xcadams/tap/peruse
```

Or [download and extract the latest release](https://github.com/0xcadams/peruse/releases/latest) for your system, then run it from the extracted folder:

```bash
./peruse /path/to/files
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
  ghcr.io/0xcadams/peruse:latest
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

Regenerate the Vercel demo's Git snapshot with `bun run generate:demo-git`.

Run the checks and build the standalone binary:

```bash
bun run check
bun run test
bun run binary
```

## License

[Unlicense](LICENSE)
