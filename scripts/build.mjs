import * as esbuild from "esbuild";
import { argv } from "process";

const isWatch = argv.includes("--watch");

const sharedOptions = {
  bundle: true,
  target: ["chrome120"],
  jsx: "automatic",
  jsxImportSource: "preact",
  sourcemap: true,
};

const builds = [
  {
    ...sharedOptions,
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/content.js",
    format: "iife",
  },
  {
    bundle: true,
    target: ["chrome120"],
    sourcemap: true,
    entryPoints: ["src/background.ts"],
    outfile: "dist/background.js",
    format: "esm",
  },
  {
    ...sharedOptions,
    entryPoints: ["src/popup/index.tsx"],
    outfile: "dist/popup.js",
    format: "iife",
  },
  {
    ...sharedOptions,
    entryPoints: ["src/options/index.tsx"],
    outfile: "dist/options.js",
    format: "iife",
  },
];

if (isWatch) {
  const contexts = await Promise.all(builds.map((opts) => esbuild.context(opts)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes...");
} else {
  await Promise.all(builds.map((opts) => esbuild.build(opts)));
  console.log("Build complete.");
}
