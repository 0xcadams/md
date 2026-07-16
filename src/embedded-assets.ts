import appScript from "../public/assets/app.js" with {type: "text"};
import logo from "../public/assets/logo.svg" with {type: "text"};
import mermaidScript from "../public/assets/mermaid.js" with {type: "text"};

import stylesheet from "../public/assets/styles.css" with {type: "text"};

export const embeddedAssets: Readonly<Record<string, string>> = {
  "app.js": appScript,
  "logo.svg": logo,
  "mermaid.js": mermaidScript,
  "styles.css": stylesheet,
};
