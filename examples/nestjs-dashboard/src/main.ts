import * as dotenv from "dotenv";
// Load .env before anything else
dotenv.config();

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as bodyParser from "body-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    rawBody: true
  });

  // Enable CORS
  app.enableCors();

  // Increase body size limit to handle large webhook payloads (e.g., base64 images)
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

  const port = process.env.PORT || 3002;
  await app.listen(port);

  console.log(`\n🚀 NestJS Dashboard running!`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
  console.log(`❤️  Health: http://localhost:${port}/health`);
  console.log(`📈 Metrics: http://localhost:${port}/metrics`);
  console.log(`\nPress Ctrl+C to stop\n`);
}

bootstrap();
