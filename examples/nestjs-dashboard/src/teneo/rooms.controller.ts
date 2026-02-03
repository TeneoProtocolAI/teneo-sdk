import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { TeneoService } from "./teneo.service";

@Controller("api/rooms")
export class RoomsController {
  constructor(private readonly teneoService: TeneoService) {}

  @Get()
  getRooms() {
    return this.teneoService.getRooms();
  }

  @Get("list")
  async listRooms() {
    try {
      return await this.teneoService.listRooms();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("available")
  getAvailableRooms() {
    const subscribedRooms = this.teneoService.getSubscribedRooms();
    const ownedRooms = this.teneoService.getOwnedRooms();
    const sharedRooms = this.teneoService.getSharedRooms();

    const availableRooms: Array<{
      id: string;
      name: string;
      type: string;
      description?: string;
    }> = [];

    if (subscribedRooms?.length > 0) {
      subscribedRooms.forEach((roomId: string) => {
        availableRooms.push({
          id: roomId,
          name: roomId,
          type: "subscribed"
        });
      });
    }

    if (ownedRooms?.length > 0) {
      ownedRooms.forEach((room) => {
        if (!availableRooms.find((r) => r.id === room.id)) {
          availableRooms.push({
            id: room.id,
            name: room.name || room.id,
            type: room.is_public ? "public" : "private",
            description: room.description || undefined
          });
        }
      });
    }

    if (sharedRooms?.length > 0) {
      sharedRooms.forEach((room) => {
        if (!availableRooms.find((r) => r.id === room.id)) {
          availableRooms.push({
            id: room.id,
            name: room.name || room.id,
            type: room.is_public ? "public" : "private",
            description: room.description || undefined
          });
        }
      });
    }

    return availableRooms;
  }

  @Post("join")
  async joinRoom(@Body() body: { roomId: string }) {
    if (!body.roomId) {
      throw new HttpException("Room ID is required", HttpStatus.BAD_REQUEST);
    }

    try {
      await this.teneoService.subscribeToPublicRoom(body.roomId);
      return { success: true };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post("leave")
  async leaveRoom(@Body() body: { roomId: string }) {
    if (!body.roomId) {
      throw new HttpException("Room ID is required", HttpStatus.BAD_REQUEST);
    }

    try {
      await this.teneoService.unsubscribeFromPublicRoom(body.roomId);
      return { success: true };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("owned")
  getOwnedRooms() {
    return this.teneoService.getOwnedRooms();
  }

  @Get("shared")
  getSharedRooms() {
    return this.teneoService.getSharedRooms();
  }

  @Get("limit")
  getRoomLimit() {
    return {
      limit: this.teneoService.getRoomLimit(),
      count: this.teneoService.getOwnedRoomCount(),
      canCreate: this.teneoService.canCreateRoom()
    };
  }

  @Post()
  async createRoom(@Body() body: { name: string; description?: string }) {
    if (!body.name) {
      throw new HttpException("Room name is required", HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.teneoService.createRoom(body.name, body.description);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(":id")
  async updateRoom(@Param("id") id: string, @Body() body: { name?: string; description?: string }) {
    if (!body.name && !body.description) {
      throw new HttpException(
        "At least one field (name or description) must be provided",
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      return await this.teneoService.updateRoom(id, body);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(":id")
  async deleteRoom(@Param("id") id: string) {
    try {
      await this.teneoService.deleteRoom(id);
      return { success: true, message: "Room deleted successfully" };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(":id/agents")
  async listRoomAgents(@Param("id") id: string, @Query("cache") cache?: string) {
    try {
      const useCache = cache !== "false";
      const agents = await this.teneoService.listRoomAgents(id, useCache);
      return {
        roomId: id,
        agents,
        cached: useCache,
        count: agents.length
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(":id/available-agents")
  async listAvailableAgents(@Param("id") id: string, @Query("cache") cache?: string) {
    try {
      const useCache = cache !== "false";
      const agents = await this.teneoService.listAvailableAgents(id, useCache);
      return {
        roomId: id,
        agents,
        cached: useCache,
        count: agents.length
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(":roomId/agents/:agentId")
  async addAgentToRoom(@Param("roomId") roomId: string, @Param("agentId") agentId: string) {
    try {
      await this.teneoService.addAgentToRoom(roomId, agentId);
      return {
        success: true,
        message: `Agent ${agentId} added to room ${roomId}`
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(":roomId/agents/:agentId")
  async removeAgentFromRoom(@Param("roomId") roomId: string, @Param("agentId") agentId: string) {
    try {
      await this.teneoService.removeAgentFromRoom(roomId, agentId);
      return {
        success: true,
        message: `Agent ${agentId} removed from room ${roomId}`
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(":roomId/agents/:agentId/check")
  checkAgentInRoom(@Param("roomId") roomId: string, @Param("agentId") agentId: string) {
    const inRoom = this.teneoService.checkAgentInRoom(roomId, agentId);
    return {
      roomId,
      agentId,
      inRoom: inRoom,
      cached: true
    };
  }

  @Get(":id/agents/count")
  getRoomAgentCount(@Param("id") id: string) {
    const count = this.teneoService.getCachedRoomAgentCount(id);
    return {
      roomId: id,
      count,
      cached: true
    };
  }

  @Post(":id/cache/invalidate")
  invalidateCache(@Param("id") id: string) {
    this.teneoService.invalidateAgentRoomCache(id);
    return {
      success: true,
      message: `Cache invalidated for room ${id}`
    };
  }
}
