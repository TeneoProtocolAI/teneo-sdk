# Changelog

All notable changes to the Teneo Protocol SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-05

### 🎉 Major Release: Multi-Room & Agent Customization

Version 2.0 introduces comprehensive room management and per-room agent customization capabilities, enabling developers to create context-specific agent experiences.

### ✨ Added

#### Phase 1: Room Management System

- **Room CRUD Operations**
  - `createRoom(name, description?)` - Create new private rooms with validation
  - `updateRoom(roomId, updates)` - Update room name/description (owner only)
  - `deleteRoom(roomId)` - Delete owned rooms

- **Room Query Methods**
  - `getOwnedRooms()` - Get all rooms you created
  - `getSharedRooms()` - Get rooms you were invited to
  - `getAllRooms()` - Get all rooms (owned + shared) convenience method
  - `getRoomById(roomId)` - Get specific room details
  - `getRoomLimit()` - Check your room creation limit
  - `canCreateRoom()` - Check if you can create more rooms
  - `getOwnedRoomCount()` - Count your owned rooms

- **Room Management Events**
  - `room:created` - Emitted when room is created
  - `room:updated` - Emitted when room is updated
  - `room:deleted` - Emitted when room is deleted
  - `room:create_error` - Emitted on creation failure
  - `room:update_error` - Emitted on update failure
  - `room:delete_error` - Emitted on deletion failure

- **Room Management Manager**
  - New `RoomManagementManager` class for room operations
  - Ownership verification before CRUD operations
  - Cached room state (owned vs shared)
  - Room limit enforcement
  - 6 new message handlers for room operations

#### Phase 2: Agent Room Management

- **Agent Room Operations**
  - `addAgentToRoom(roomId, agentId)` - Add agent to your room (owner only)
  - `removeAgentFromRoom(roomId, agentId)` - Remove agent from your room
  - `listRoomAgents(roomId, useCache?)` - List agents in room with 5-min cache
  - `listAvailableAgents(roomId, useCache?)` - List agents available to add

- **Agent Room Query Methods (Synchronous)**
  - `getRoomAgents(roomId)` - Get cached room agents instantly
  - `getAvailableAgents(roomId)` - Get cached available agents instantly
  - `isAgentInRoom(roomId, agentId)` - Check if agent is in room (cached)
  - `getRoomAgentCount(roomId)` - Get agent count from cache

- **Cache Management**
  - `invalidateAgentRoomCache(roomId)` - Manually clear cache for specific room
  - Intelligent 5-minute TTL caching for performance
  - Automatic cache invalidation on agent add/remove
  - Automatic cache invalidation on agent status updates

- **Agent Room Events**
  - `agent_room:agent_added` - Emitted when agent added to room
  - `agent_room:agent_removed` - Emitted when agent removed from room
  - `agent_room:agents_listed` - Emitted when room agents listed
  - `agent_room:available_agents_listed` - Emitted when available agents listed
  - `agent_room:status_update` - Real-time agent status updates
  - `agent_room:add_error` - Emitted on agent add failure
  - `agent_room:remove_error` - Emitted on agent remove failure
  - `agent_room:list_error` - Emitted on list failure
  - `agent_room:list_available_error` - Emitted on available list failure

- **Agent Room Manager**
  - New `AgentRoomManager` class for agent-room operations
  - Ownership verification before operations
  - Performance-optimized caching with TTL
  - Real-time status update handling
  - 5 new message handlers for agent room operations

#### Type System Updates

- Updated `RoomInfo` interface with `created_by` field (creator wallet address)
- Fixed `Capability` schema: `type` → `name`, description now optional
- Fixed `Command` schema: `command` → `trigger`, added `argument` field, description optional
- Updated `AuthenticationState` with room categorization:
  - `privateRoomIds` - Array of owned room IDs
  - `sharedRoomIds` - Array of shared room IDs
  - `maxPrivateRooms` - Room creation limit
- New `AgentRoomInfo` interface for agent-room metadata
- 26 new message types and schemas for room/agent-room operations

### 📊 Testing

- Added 102 new unit tests for Phase 1 and Phase 2
- Total test count: 671 tests passing (100% pass rate)
- Comprehensive coverage of room management
- Comprehensive coverage of agent room management
- All manager and handler tests passing

### 🔄 Changed

- Message handlers now use `BaseMessageHandler` pattern
- Enhanced event system with 14 new event types
- WebSocketClient now manages room and agent-room managers

### 🐛 Fixed

- Schema field names now match backend source of truth
- Proper defensive copying for cache immutability
- Validation for empty room/agent IDs
- Proper room ownership checks before operations
- Auth handler now correctly parses `private_rooms` array from cached authentication messages
- Room management events now properly forward from WebSocket handlers to SDK instance
- Room persistence: Private rooms now correctly persist after page refresh via proper initialization of RoomManagementManager from auth state

### 📚 Documentation

- Comprehensive README updates with v2.0 features
- New "What's New in v2.0" section
- Complete Room Management API documentation
- Complete Agent Room Management API documentation
- Updated event system documentation with all new events
- Code examples for all new features
- Updated test count and status

### 🔐 Security

- Ownership verification for all room CRUD operations
- Ownership verification for agent-room operations
- Validation of room and agent IDs before operations
- Room existence checks before operations

### ⚡ Performance

- 5-minute cache TTL for agent room queries
- Automatic cache invalidation on updates
- Intelligent cache management per room
- Defensive copying to prevent cache mutation
- Synchronous query methods for instant cache access

---

## [1.0.2] - 2025-10-XX

### Fixed

- Minor bug fixes and improvements

---

## [1.0.0] - 2025-10-XX

### Initial Release

- WebSocket connection management
- Ethereum wallet authentication (challenge-response)
- Agent discovery and listing
- Message sending to agents
- Event-driven architecture
- Room subscription/unsubscription
- Webhook integration with circuit breaker
- Retry strategies (exponential, linear, constant)
- Message deduplication
- Signature verification
- Rate limiting
- Secure private key management (AES-256-GCM encryption)
- Comprehensive error handling
- TypeScript support
- 488 unit tests

---

## Migration Guide

### Upgrading from v1.x to v2.0

Version 2.0 is **backward compatible** with v1.x for basic operations. However, to take advantage of new features:

#### 1. Update Package Version

```bash
pnpm install @teneo-protocol/sdk@2.0.0
```

#### 2. Room Management (New Features)

**Before (v1.x):** Single room subscription

```typescript
await sdk.subscribeToRoom("room-id");
```

**After (v2.0):** Create and manage multiple rooms

```typescript
// Create your own rooms
const room = await sdk.createRoom("My Room", "Description");

// Get all your rooms
const ownedRooms = sdk.getOwnedRooms();
const sharedRooms = sdk.getSharedRooms();

// Update/delete rooms
await sdk.updateRoom(room.id, { name: "Updated Name" });
await sdk.deleteRoom(room.id);
```

#### 3. Agent Customization (New Features)

**New in v2.0:** Customize which agents are in each room

```typescript
// List available agents for a room
const available = await sdk.listAvailableAgents(room.id);

// Add specific agents
await sdk.addAgentToRoom(room.id, "agent-id");

// List agents in room
const roomAgents = await sdk.listRoomAgents(room.id);

// Remove agents
await sdk.removeAgentFromRoom(room.id, "agent-id");
```

#### 4. Type Changes

If you're using TypeScript and accessing agent data directly:

**Capability field name changed:**

```typescript
// Before: agent.capabilities[0].type
// After:  agent.capabilities[0].name
```

**Command field name changed:**

```typescript
// Before: agent.commands[0].command
// After:  agent.commands[0].trigger
```

#### 5. No Breaking Changes

All v1.x APIs continue to work:

- ✅ `connect()`, `disconnect()`
- ✅ `sendMessage()`
- ✅ `subscribeToRoom()`, `unsubscribeFromRoom()`
- ✅ `getAgents()`, `getAgent()`
- ✅ All existing events

---

## Support

- 📖 [Documentation](https://github.com/TeneoProtocolAI/teneo-sdk)
- 🐛 [Issue Tracker](https://github.com/TeneoProtocolAI/teneo-sdk/issues)
- 💬 [Discussions](https://github.com/TeneoProtocolAI/teneo-sdk/discussions)
