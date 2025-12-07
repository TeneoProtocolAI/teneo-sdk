import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TeneoModule } from "./teneo/teneo.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    TeneoModule
  ],
  controllers: [AppController]
})
export class AppModule {}
