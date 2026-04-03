import type { ForgeConfig } from "@electron-forge/shared-types";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import path from "node:path";
import fs from "node:fs";

/**
 * Native modules that must be copied into the packaged app's node_modules.
 *
 * Vite marks these as `external` so the bundled code emits bare `require("better-sqlite3")`
 * calls, but the Vite plugin does NOT copy the actual module folders into the build output.
 * The `packageAfterCopy` hook below handles that, and `AutoUnpackNativesPlugin` ensures the
 * .node binaries are extracted from the ASAR so they can be dlopen'd at runtime.
 */
const NATIVE_MODULES = ["better-sqlite3", "bindings", "file-uri-to-path", "prebuild-install", "node-addon-api", "sqlite-vec", "onnxruntime-node", "fastembed", "@anush008/tokenizers", "@anush008/tokenizers-darwin-universal"];

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/*.node",
    },
    name: "Hive",
    executableName: "hive",
    icon: path.resolve(__dirname, "resources", "icon"),
    appBundleId: "com.hive-deck.app",
    appCategoryType: "public.app-category.developer-tools",
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native modules into the packaged app so `require("better-sqlite3")` resolves.
      // buildPath is the temp directory that becomes the app content (ASAR source).
      const destNodeModules = path.join(buildPath, "node_modules");
      fs.mkdirSync(destNodeModules, { recursive: true });

      for (const mod of NATIVE_MODULES) {
        const src = path.join(process.cwd(), "node_modules", mod);
        const dest = path.join(destNodeModules, mod);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true, dereference: true });
        }
      }
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new AutoUnpackNativesPlugin({}),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
