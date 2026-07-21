import snapshot from "../demo-git/generated.json" with {type: "json"};
import {createDemoGitMetadata, type DemoGitSnapshotData} from "./demo-git-data.js";

export const demoGitMetadata = createDemoGitMetadata(snapshot as DemoGitSnapshotData);
