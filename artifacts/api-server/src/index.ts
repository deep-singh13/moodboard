import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { initDb } from "./lib/db";
import { ensureDistrictIndex } from "./lib/districtIndex";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initDb()
  .then(() => {
    logger.info("Database initialised");
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");

      // Kick off after the port is bound, and deliberately not awaited: a first
      // ingest takes a couple of minutes, and blocking here would stall the
      // platform health check and delay every other route. It's a no-op once
      // the configured cities have rows.
      void ensureDistrictIndex();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialise database");
    process.exit(1);
  });
