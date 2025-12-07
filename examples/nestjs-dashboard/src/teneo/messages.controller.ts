import { Controller, Post, Body, HttpException, HttpStatus } from "@nestjs/common";
import { TeneoService } from "./teneo.service";

@Controller("api/messages")
export class MessagesController {
  constructor(private readonly teneoService: TeneoService) {}

  @Post()
  async sendMessage(@Body() body: { content: string; room: string; waitForResponse?: boolean }) {
    if (!body.content || typeof body.content !== "string") {
      throw new HttpException("Content is required", HttpStatus.BAD_REQUEST);
    }

    if (!body.room || typeof body.room !== "string") {
      throw new HttpException("Room is required", HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await this.teneoService.sendMessage(
        body.content,
        body.room,
        body.waitForResponse || false
      );

      return {
        success: true,
        response: response || null
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post("direct-command")
  async sendDirectCommand(@Body() body: { agent: string; command: string; room?: string }) {
    if (!body.agent || !body.command) {
      throw new HttpException("Agent and command are required", HttpStatus.BAD_REQUEST);
    }

    try {
      await this.teneoService.sendDirectCommand(body.agent, body.command, body.room);
      return { success: true };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
