// remotion/index.ts
//
// Remotion bundle entry point. Referenced by remotion.config.ts and by the
// `remotion:*` scripts in package.json. This is NOT part of the Vite app
// bundle — the app never imports it.

import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
