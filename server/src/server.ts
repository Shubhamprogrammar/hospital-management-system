import "dotenv/config";
import { app } from "./app.js";
import { connectMongo } from "./config/mongoose.js";
import { env } from "./config/env.js";

async function main() {
  await connectMongo();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

main().catch(console.error);
