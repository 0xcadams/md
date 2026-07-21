Tailscale Serve reported a valid HTTPS proxy to a healthy local dev server, but HTTPS requests from the serving Mac to its own tailnet hostname were reset. Verify Serve from another tailnet peer when local self-requests fail this way.

Deleting `public/assets` during a rebuild makes `bun --watch` restart while embedded asset imports are missing. Asset builds must overwrite in place so watched development servers restart cleanly.
