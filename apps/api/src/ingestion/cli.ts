import { db } from "../db";
import { MimitFuelDataProvider } from "../providers/fuel-data/MimitFuelDataProvider";
import { runIngestion } from "./runIngestion";

runIngestion(new MimitFuelDataProvider())
  .then(async (summary) => {
    console.log("Ingestione completata:", summary);
    await db.destroy();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Ingestione fallita:", error);
    await db.destroy();
    process.exit(1);
  });
