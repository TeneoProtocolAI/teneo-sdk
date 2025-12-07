import { Module } from "@nestjs/common";
import { TeneoService } from "./teneo.service";
import { MessagesController } from "./messages.controller";
import { RoomsController } from "./rooms.controller";
import { AgentsController } from "./agents.controller";
import { EventsController } from "./events.controller";

@Module({
  providers: [TeneoService],
  controllers: [MessagesController, RoomsController, AgentsController, EventsController],
  exports: [TeneoService]
})
export class TeneoModule {}
