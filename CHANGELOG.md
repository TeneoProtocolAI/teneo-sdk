# Changelog

All notable changes to the Teneo Protocol SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-01-28

### 🎉 Major Release: API Naming Improvements

Version 3.0 introduces comprehensive naming improvements to make the SDK API more intuitive and explicit. All renamed methods include deprecated aliases for backward compatibility during migration.

### 💥 Breaking Changes

#### Room Subscription Clarity

**Before:**
```typescript
const sdk = new TeneoSDK({
  autoJoinRooms: ['room-1', 'room-2']
});
await sdk.subscribeToRoom('room-id');
await sdk.unsubscribeFromRoom('room-id');
```

**After (v3.0):**
```typescript
const sdk = new TeneoSDK({
  autoJoinPublicRooms: ['room-1', 'room-2']  // Explicit: only public rooms
});
await sdk.subscribeToPublicRoom('room-id');     // Explicit: only works for public rooms
await sdk.unsubscribeFromPublicRoom('room-id'); // Private rooms are auto-available
```

**Why:** These methods only work with public rooms. Private rooms are automatically available after authentication. The new names make this distinction explicit.

---

#### Cache-Only Methods Now Explicit

**Before:**
```typescript
const agents = sdk.getRoomAgents('room-123');           // Unclear: cache or fetch?
const available = sdk.getAvailableAgents('room-123');   // Unclear: cache or fetch?
const count = sdk.getRoomAgentCount('room-123');        // Returns undefined if not cached
```

**After (v3.0):**
```typescript
const agents = sdk.getCachedRoomAgents('room-123');           // Clear: cache-only
const available = sdk.getCachedAvailableAgents('room-123');   // Clear: cache-only
const count = sdk.getCachedRoomAgentCount('room-123');        // Clear: cache-only

// Async methods unchanged (still fetch from server):
await sdk.listRoomAgents('room-123');        // Still async fetch
await sdk.listAvailableAgents('room-123');   // Still async fetch
```

**Why:** Method names now clearly indicate sync (cache-only) vs async (server fetch) behavior.

---

#### Boolean Method Semantic Clarity

**Before:**
```typescript
const result = sdk.isAgentInRoom('room-123', 'agent-456');
// Returns: boolean | undefined (but 'is*' implies boolean-only)
```

**After (v3.0):**
```typescript
const result = sdk.checkAgentInRoom('room-123', 'agent-456');
// Returns: boolean | undefined (name doesn't mislead about return type)
// - true: agent IS in room (verified)
// - false: agent is NOT in room (verified)
// - undefined: cache unavailable (need to fetch)
```

**Why:** `is*` naming convention implies boolean-only return. `check*` makes it clear the method may return multiple states.

---

#### Network-Wide Search Scope Clarity

**Before:**
```typescript
const agents = sdk.findAgentsByCapability('weather');  // Unclear: what scope?
const results = sdk.findAgentsByName('bot');           // All agents? Room agents?
const online = sdk.findAgentsByStatus('online');       // Which agents?
```

**After (v3.0):**
```typescript
const agents = sdk.findAvailableAgentsByCapability('weather');  // Clear: all available agents
const results = sdk.findAvailableAgentsByName('bot');           // Clear: network-wide search
const online = sdk.findAvailableAgentsByStatus('online');       // Clear: all available agents
```

**Why:** These methods search ALL available agents network-wide, not just room-specific agents. The new names make this scope explicit.

---

### 🔄 Migration Guide

**All old method names are deprecated but still work!** You'll see deprecation warnings in TypeScript/JSDoc. Update at your convenience:

1. **Search & Replace** across your codebase:
   - `autoJoinRooms:` → `autoJoinPublicRooms:`
   - `.subscribeToRoom(` → `.subscribeToPublicRoom(`
   - `.unsubscribeFromRoom(` → `.unsubscribeFromPublicRoom(`
   - `.getRoomAgents(` → `.getCachedRoomAgents(`
   - `.getAvailableAgents(` → `.getCachedAvailableAgents(`
   - `.getRoomAgentCount(` → `.getCachedRoomAgentCount(`
   - `.isAgentInRoom(` → `.checkAgentInRoom(`
   - `.findAgentsByCapability(` → `.findAvailableAgentsByCapability(`
   - `.findAgentsByName(` → `.findAvailableAgentsByName(`
   - `.findAgentsByStatus(` → `.findAvailableAgentsByStatus(`

2. **Update TypeScript types** if you reference them directly

3. **Test thoroughly** - all functionality remains the same, only names changed

---

### ✨ Summary of Changes

- **6 major naming improvements** for clarity and consistency
- **All old names deprecated** with helpful migration messages
- **Zero functional changes** - only naming improvements
- **Backward compatible** - old names still work via aliases
- **All documentation updated** - README, CONCEPTS, examples

---

## [2.2.2]

### 🐛 Fixed

- Added minimal-chat example for quick SDK testing

---

## [2.2.1]

### 🐛 Fixed

- Fixed `getRooms()`/`getRoom()` race condition after connect
- Fixed `room_list_response` message type to match backend

---

## [2.2.0]

### Quote-Approve Payment Flow

Payments now use a quote-approve model. Instead of attaching payments blindly, the SDK requests a quote from the server first, then confirms with payment.

### ✨ Added

- **Quote-Approve Flow**
  - `requestQuote(content, room)` - Request a quote without auto-approval
  - `confirmQuote(taskId, options?)` - Confirm and pay for a quoted task
  - `getPendingQuote(taskId)` - Get a pending quote by task ID
  - New `QuoteResult` type with agent, pricing, and expiration info

- **New Message Types**
  - `request_task` - Request a task quote from coordinator
  - `task_quote` - Server response with pricing info
  - `confirm_task` - Confirm and execute with payment

- **New Config Options**
  - `autoApproveQuotes` - Auto-confirm quotes (default: `true`)
  - `quoteTimeout` - Timeout for quote responses (default: `30000`ms)

- **New Schemas**
  - `PricingInfoSchema` - Agent pricing metadata
  - `RequestTaskMessageSchema`, `TaskQuoteMessageSchema`, `ConfirmTaskMessageSchema`

- **Factory Functions & Type Guards**
  - `createRequestTask()`, `createConfirmTask()`
  - `isTaskQuote()` type guard

### 🔄 Changed

- `sendMessage()` and `sendDirectCommand()` now use quote-approve flow by default
- Payments are always enabled - removed `paymentsEnabled` config option
- Payment client is set up automatically when `privateKey` is provided
- `withPayments()` builder no longer has `enabled` option

### ⚠️ Breaking Changes

- `paymentsEnabled` config option removed — payments are always enabled when `privateKey` is provided
- `validatePrice()` method removed — price validation now happens in `confirmQuote`
- `attachPayment()` method removed — payment attachment now happens in `confirmQuote`
- `setAgentRegistry()` method removed — no longer needed
- `withPayments()` builder no longer accepts `enabled` option

### 🗑️ Removed

- `paymentsEnabled` config option (payments always on)
- Legacy `validatePrice()` method (price check moved to `confirmQuote`)
- Legacy `attachPayment()` method (handled in `confirmQuote`)
- `setAgentRegistry()` method (no longer needed)

### 📚 Documentation

- Updated Payment Integration section with quote-approve examples
- Added Manual Quote Flow documentation
- Updated Environment Variables section

---

## [2.1.0] - 2025-12-08

### ✨ Added

#### Automatic X402 Payment Signing

- SDK now auto-signs x402 payment headers when confirming tasks
- Uses PEAQ chain with USDC stablecoin for micropayments
- No manual payment encoding needed - just call `confirmQuote(taskId)`

### 📦 Dependencies

- Added `x402` library for payment signing support

---

## [2.0.0] - 2025-11-05

### 🎉 Major Release: Multi-Room & Agent Customization

Version 2.0 introduces comprehensive room management and per-room agent customization capabilities, enabling developers to create context-specific agent experiences.

### ✨ Added

#### Phase 1: Room Management System

- **Room CRUD Operations**
  - `createRoom({ name, description?, isPublic? })` - Create new rooms with validation
  - `updateRoom(roomId, updates)` - Update room name/description (owner only)
  - `deleteRoom(roomId)` - Delete owned rooms

- **Room Query Methods**
  - `getOwnedRooms()` - Get all rooms you created
  - `getSharedRooms()` - Get rooms you were invited to
  - `getAllRooms()` - Get all rooms (owned + shared) convenience method
  - `getRoom(roomId)` - Get specific room details
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
  - `getCachedRoomAgents(roomId)` - Get cached room agents instantly
  - `getCachedAvailableAgents(roomId)` - Get cached available agents instantly
  - `checkAgentInRoom(roomId, agentId)` - Check if agent is in room (cached)
  - `getCachedRoomAgentCount(roomId)` - Get agent count from cache

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
await sdk.subscribeToPublicRoom("room-id");
```

**After (v2.0):** Create and manage multiple rooms

```typescript
// Create your own rooms
const room = await sdk.createRoom({ name: "My Room", description: "Description" });

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
- ✅ `subscribeToPublicRoom()`, `unsubscribeFromPublicRoom()`
- ✅ `getAgents()`, `getAgent()`
- ✅ All existing events

---

## Support

- 📖 [Documentation](https://github.com/TeneoProtocolAI/teneo-sdk)
- 🐛 [Issue Tracker](https://github.com/TeneoProtocolAI/teneo-sdk/issues)
- 💬 [Discussions](https://github.com/TeneoProtocolAI/teneo-sdk/discussions)
