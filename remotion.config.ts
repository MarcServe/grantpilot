import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";

const macChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

Config.setEntryPoint("remotion/index.ts");
Config.setPublicDir("public");
Config.setRendererPort(3975);
Config.setStudioPort(3976);
Config.setDelayRenderTimeoutInMilliseconds(60000);

if (existsSync(macChromePath)) {
  Config.setBrowserExecutable(macChromePath);
}
