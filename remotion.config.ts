// remotion.config.ts
//
// Applies to the Remotion CLI and Studio only (`npm run remotion:studio`,
// `npm run remotion:render`). It has no effect on the Vite app build.
// Reference: https://www.remotion.dev/docs/config

import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./remotion/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
