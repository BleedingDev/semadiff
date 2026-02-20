import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      format: "esm",
      syntax: "esnext",
      dts: true,
      source: {
        entry: {
          index: "./src/index.tsx",
        },
      },
      output: {
        target: "web",
      },
      tools: {
        swc: {
          jsc: {
            transform: {
              react: {
                runtime: "automatic",
              },
            },
          },
        },
      },
    },
  ],
});
