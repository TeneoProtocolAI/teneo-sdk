import { Controller, Get, Post, Body, Res } from "@nestjs/common";
import { Response } from "express";
import { TeneoService } from "./teneo.service";

@Controller("api")
export class EventsController {
  constructor(private readonly teneoService: TeneoService) {}

  @Get("events")
  getEvents() {
    return this.teneoService.getRecentEvents();
  }

  @Get("messages")
  getMessages() {
    return this.teneoService.getRecentMessages();
  }

  @Get("webhooks")
  getWebhooks() {
    return this.teneoService.getRecentWebhooks();
  }

  @Post("webhook")
  receiveWebhook(@Body() body: any) {
    this.teneoService.addWebhook(body);
    return { status: "success", received: true };
  }

  @Get("sse")
  sseEndpoint(@Res() res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    this.teneoService.addSSEClient(res);

    // Send initial connection status
    const connected = this.teneoService.isConnected();
    const authenticated = this.teneoService.isAuthenticated();

    res.write(
      `data: ${JSON.stringify({ type: "connection", status: connected ? "connected" : "disconnected" })}\n\n`
    );
    res.write(
      `data: ${JSON.stringify({ type: "auth", status: authenticated ? "success" : "pending" })}\n\n`
    );

    // Keep-alive ping every 30 seconds
    const keepAliveInterval = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAliveInterval);
        this.teneoService.removeSSEClient(res);
      }
    }, 30000);

    res.on("close", () => {
      clearInterval(keepAliveInterval);
      this.teneoService.removeSSEClient(res);
    });
  }
}
