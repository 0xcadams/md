# Papercuts

- The `mime-types` database classifies `.ts` as MPEG transport stream, so source responses need an explicit TypeScript MIME override.
- Bun's programmatic standalone compiler can leave hidden `.bun-build` intermediates in the project root; they are ignored by Git.
