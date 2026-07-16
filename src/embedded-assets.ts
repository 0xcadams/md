import appScript from "../public/assets/app.js" with {type: "text"};
// oxlint-disable-next-line import/default -- Bun text imports expose file contents as default exports.
import mermaidScript from "../public/assets/mermaid.js" with {type: "text"};

import stylesheet from "../public/assets/styles.css" with {type: "text"};

export const embeddedAssets: Readonly<Record<string, string>> = {
  "app.js": appScript,
  "mermaid.js": mermaidScript,
  "styles.css": stylesheet,
};
