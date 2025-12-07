import { Controller, Get, Param, HttpException, HttpStatus } from "@nestjs/common";
import { TeneoService } from "./teneo.service";

@Controller("api/agents")
export class AgentsController {
  constructor(private readonly teneoService: TeneoService) {}

  @Get()
  getAgents() {
    return this.teneoService.getAgents();
  }

  @Get("search/capability/:capability")
  findAgentsByCapability(@Param("capability") capability: string) {
    try {
      const agents = this.teneoService.findAgentsByCapability(capability);
      return {
        capability,
        count: agents.length,
        agents
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get("search/name/:name")
  findAgentsByName(@Param("name") name: string) {
    try {
      const agents = this.teneoService.findAgentsByName(name);
      return {
        query: name,
        count: agents.length,
        agents
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get("search/status/:status")
  findAgentsByStatus(@Param("status") status: string) {
    try {
      const agents = this.teneoService.findAgentsByStatus(status);
      return {
        status,
        count: agents.length,
        agents
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
