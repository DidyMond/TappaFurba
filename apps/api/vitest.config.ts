import { defineConfig } from "vitest/config";

// Suite di default: ermetica (zero rete, zero database). I test che richiedono
// PostgreSQL stanno in test/db e si lanciano a parte con `pnpm test:db`.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/db/**", "node_modules/**"],
    server: {
      deps: {
        // I pacchetti workspace sono sorgenti TypeScript, non build precompilate.
        inline: [/@tappafurba\//],
      },
    },
  },
});
