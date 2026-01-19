# Teneo SDK - NestJS Dashboard Example

A comprehensive NestJS example demonstrating how to integrate the Teneo Protocol SDK into a NestJS application.

## Features

- ✅ **Interactive Dashboard**: Real-time web UI for monitoring and control
- ✅ **NestJS Integration**: Proper module/service/controller architecture
- ✅ **SDK Lifecycle Management**: Automatic initialization and cleanup
- ✅ **WebSocket Connection**: Auto-reconnection with exponential backoff
- ✅ **Authentication**: Ethereum wallet authentication with encrypted keys
- ✅ **Message Handling**: Send messages and direct commands to agents
- ✅ **Room Management**: Create, update, delete, and manage rooms
- ✅ **Agent Management**: Search agents by capability, name, or status
- ✅ **Agent-Room Management**: Add/remove agents from rooms with caching
- ✅ **Health Monitoring**: Health and metrics endpoints
- ✅ **TypeScript**: Fully typed with TypeScript
- ✅ **REST API**: Complete REST API for all SDK operations

## Prerequisites

- Node.js 18 or higher
- pnpm (recommended) or npm
- Ethereum wallet with private key
- Access to a Teneo Protocol server

## Installation

```bash
cd examples/nestjs-dashboard
pnpm install
```

## Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and configure your settings:

```env
# Teneo SDK Configuration
WS_URL=wss://your-teneo-server.com/ws
PRIVATE_KEY=your_ethereum_private_key_here
WALLET_ADDRESS=your_ethereum_wallet_address_here

# Signature Verification (optional)
ENABLE_SIGNATURE_VERIFICATION=false
TRUSTED_ADDRESSES=0x1234...,0x5678...

# Server Configuration
PORT=3002
```

## Running the Application

### Development Mode (with hot reload)

```bash
pnpm start:dev
```

### Production Mode

```bash
# Build
pnpm build

# Run
pnpm start:prod
```

### Debug Mode

```bash
pnpm start:debug
```

## API Endpoints

### Health & Status

- `GET /` - Application status
- `GET /health` - SDK health check
- `GET /metrics` - Detailed metrics

### Messages

- `POST /api/messages` - Send a message
  ```json
  {
    "content": "Hello agents!",
    "room": "room-id",
    "waitForResponse": false
  }
  ```

- `POST /api/messages/direct-command` - Send direct command to agent
  ```json
  {
    "agent": "agent-id",
    "command": "execute task",
    "room": "room-id"
  }
  ```

### Agents

- `GET /api/agents` - List all agents
- `GET /api/agents/search/capability/:capability` - Find agents by capability
- `GET /api/agents/search/name/:name` - Find agents by name
- `GET /api/agents/search/status/:status` - Find agents by status

### Rooms

- `GET /api/rooms` - List all rooms
- `GET /api/rooms/list` - List detailed room information
- `GET /api/rooms/available` - List available rooms for messaging
- `GET /api/rooms/owned` - List owned rooms
- `GET /api/rooms/shared` - List shared rooms
- `GET /api/rooms/limit` - Get room limit info
- `POST /api/rooms` - Create a new room
  ```json
  {
    "name": "My Room",
    "description": "A room for testing"
  }
  ```
- `PUT /api/rooms/:id` - Update a room
  ```json
  {
    "name": "Updated Name",
    "description": "Updated description"
  }
  ```
- `DELETE /api/rooms/:id` - Delete a room
- `POST /api/rooms/join` - Join a room
  ```json
  {
    "roomId": "room-id"
  }
  ```
- `POST /api/rooms/leave` - Leave a room
  ```json
  {
    "roomId": "room-id"
  }
  ```

### Agent-Room Management

- `GET /api/rooms/:id/agents` - List agents in a room
- `GET /api/rooms/:id/available-agents` - List available agents for a room
- `POST /api/rooms/:roomId/agents/:agentId` - Add agent to room
- `DELETE /api/rooms/:roomId/agents/:agentId` - Remove agent from room
- `GET /api/rooms/:roomId/agents/:agentId/check` - Check if agent is in room
- `GET /api/rooms/:id/agents/count` - Get agent count for room
- `POST /api/rooms/:id/cache/invalidate` - Invalidate room agent cache

## Architecture

### Module Structure

```
src/
├── app.module.ts          # Root module
├── app.controller.ts      # Root controller
├── main.ts                # Application entry point
└── teneo/
    ├── teneo.module.ts         # Teneo module
    ├── teneo.service.ts        # SDK service with lifecycle
    ├── messages.controller.ts  # Message handling
    ├── agents.controller.ts    # Agent operations
    └── rooms.controller.ts     # Room management
```

### Service Lifecycle

The `TeneoService` implements NestJS lifecycle hooks:

- `onModuleInit()`: Initializes and connects the SDK
- `onModuleDestroy()`: Gracefully disconnects and cleans up the SDK

This ensures proper resource management and graceful shutdowns.

## Example Usage

### Using curl

```bash
# Check health
curl http://localhost:3002/health

# Send a message
curl -X POST http://localhost:3002/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What is the weather?",
    "room": "general",
    "waitForResponse": true
  }'

# List agents
curl http://localhost:3002/api/agents

# Find agents by capability
curl http://localhost:3002/api/agents/search/capability/weather

# Create a room
curl -X POST http://localhost:3002/api/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Private Room",
    "description": "A room for my personal agents"
  }'
```

### Using the SDK in Your NestJS App

To integrate the Teneo SDK into your own NestJS application:

1. Copy the `teneo/` directory to your `src/` folder
2. Import `TeneoModule` in your app module:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TeneoModule } from './teneo/teneo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TeneoModule,
  ],
})
export class AppModule {}
```

3. Inject `TeneoService` into your controllers or services:

```typescript
import { Injectable } from '@nestjs/common';
import { TeneoService } from './teneo/teneo.service';

@Injectable()
export class MyService {
  constructor(private readonly teneoService: TeneoService) {}

  async doSomething() {
    const agents = this.teneoService.getAgents();
    // ... use the SDK
  }
}
```

## Troubleshooting

### SDK not connecting

- Verify your `WS_URL` is correct
- Check that your `PRIVATE_KEY` and `WALLET_ADDRESS` are valid
- Ensure you have network access to the Teneo server

### TypeScript errors

- Make sure all dependencies are installed: `pnpm install`
- Check that TypeScript version is compatible (5.x)

### Module not found errors

- Verify the path to the SDK in `teneo.service.ts` is correct
- The example expects the SDK to be built at `../../../../dist/index.js`
- If your setup is different, adjust the import path

## Production Considerations

1. **Environment Variables**: Use proper secret management in production
2. **Error Handling**: Add proper error handling and logging
3. **Rate Limiting**: Consider adding rate limiting to API endpoints
4. **Authentication**: Add authentication/authorization to your endpoints
5. **Monitoring**: Set up proper monitoring and alerting
6. **Graceful Shutdown**: The service handles graceful shutdowns automatically

## Learn More

- [Teneo Protocol Documentation](https://docs.teneo.pro)
- [NestJS Documentation](https://docs.nestjs.com)
- [Teneo SDK Documentation](../../README.md)

## License

MIT
