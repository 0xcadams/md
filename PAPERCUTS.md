# Papercuts

- `brew audit Formula/peruse.rb` enabled Homebrew developer mode before failing because path-based audits are disabled; register the tap and audit by formula name instead.
- `bun test` bypasses the package's `test` script and can exercise stale generated assets; use `bun run test` so assets are rebuilt first.
