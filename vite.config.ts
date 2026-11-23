import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
// @ts-expect-error módulo JS do servidor, sem declaração
import { attachLichess } from "./server/novaPosicao.mjs";

function lichessApi() {
  return {
    name: "lichess-nova-posicao",
    configureServer(server: { middlewares: { use: (...args: never[]) => void } }) {
      attachLichess(server);
    },
    configurePreviewServer(server: { middlewares: { use: (...args: never[]) => void } }) {
      attachLichess(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), lichessApi()],
  test: {
    environment: "node",
  },
});
