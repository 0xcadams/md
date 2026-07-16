import appScript from "../public/assets/app.js" with {type: "text"};
import mermaidScript from "../public/assets/mermaid.js" with {type: "text"};

import stylesheet from "../public/assets/styles.css" with {type: "text"};

export const embeddedAssets: Readonly<Record<string, string>> = {
  "app.js": appScript,
  "mermaid.js": mermaidScript,
  "styles.css": stylesheet,
};
