<p align="center">
  <img src="logo.svg" alt="md" width="96" height="96">
</p>

`md` is a minimal server for viewing markdown and code.

Point it at a directory and open the URL it prints. Directories look like GitHub: files first, then `README.md` or `INDEX.md`. Markdown and source code are rendered with Shiki.

[Try the demo](https://md.cadams.io).

## Run

Download a binary from [Releases](https://github.com/0xcadams/md/releases), then:

```bash
./md /path/to/files
```

Open `http://127.0.0.1:8080`.

The binary includes the server, syntax highlighter, themes, and browser assets. No runtime or installation is required.

## Docker

```bash
docker run --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 8080:8080 \
  --mount type=bind,src="$PWD",dst=/data,readonly \
  ghcr.io/0xcadams/md:latest
```

## Features

- GitHub Flavored Markdown and Shiki syntax highlighting
- GitHub-style directory listings with rendered READMEs
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
