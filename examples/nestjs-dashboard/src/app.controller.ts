import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { TeneoService } from "./teneo/teneo.service";
import * as path from "path";

@Controller()
export class AppController {
  constructor(private readonly teneoService: TeneoService) {}

  @Get()
  getDashboard(@Res() res: Response) {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
  }

  @Get("health")
  getHealth() {
    return this.teneoService.getHealth();
  }

  @Get("metrics")
  getMetrics() {
    return this.teneoService.getMetrics();
  }
}
