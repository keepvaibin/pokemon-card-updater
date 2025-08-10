import { runRollups } from "../functions/price-history-rollup/index";

// Minimal mock for InvocationContext
const context = {
  log: console.log,
  error: console.error,
};

(async () => {
  try {
    await runRollups(context as any);
    console.log("[manual] Rollup completed successfully.");
  } catch (err) {
    console.error("[manual] Rollup failed:", err);
    process.exit(1);
  }
})();
