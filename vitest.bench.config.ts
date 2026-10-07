import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { vitestWorkerArgv } from "./vitest.workerArgv";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/shared/bench/**/*.bench.ts"],
    poolOptions: {
      forks: {
        execArgv: vitestWorkerArgv,
      },
    },
  },
});
