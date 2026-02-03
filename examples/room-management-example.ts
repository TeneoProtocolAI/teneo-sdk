/**
 * Room Management Example
 *
 * Demonstrates how to create, manage, and organize multiple rooms in the Teneo SDK v2.0.
 *
 * This example shows:
 * - Creating rooms with different configurations
 * - Checking room limits and quotas
 * - Querying owned vs shared rooms
 * - Updating room properties
 * - Deleting rooms
 * - Handling room events
 *
 * Prerequisites:
 * - Set TENEO_WS_URL environment variable
 * - Set PRIVATE_KEY environment variable (64 hex characters, no 0x prefix)
 *
 * Run:
 *   npx ts-node examples/room-management-example.ts
 */

import { TeneoSDK } from "../src";
import * as dotenv from "dotenv";

dotenv.config();

const wsUrl = process.env.TENEO_WS_URL!;
const privateKey = process.env.PRIVATE_KEY!;

async function main() {
  console.log("🚀 Teneo SDK v2.0 - Room Management Example\n");

  // Initialize SDK
  const sdk = new TeneoSDK({
    wsUrl,
    privateKey,
    logLevel: "info",
    reconnect: true
  });

  // Set up event listeners for room operations
  setupEventListeners(sdk);

  try {
    // Connect and authenticate
    console.log("📡 Connecting to Teneo Protocol...");
    await sdk.connect();
    console.log("✅ Connected and authenticated\n");

    // Wait a moment for initial room data to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 1: Check current room status
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Current Room Status");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    await displayRoomStatus(sdk);

    // Step 2: Create new rooms
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏗️  Creating New Rooms");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const newRooms = await createSampleRooms(sdk);

    // Wait for room creation events to process
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 3: Display updated room status
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Updated Room Status");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    await displayRoomStatus(sdk);

    // Step 4: Update a room
    if (newRooms.length > 0) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📝 Updating Room");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      await updateRoomExample(sdk, newRooms[0].id);
    }

    // Step 5: Query specific room
    if (newRooms.length > 0) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 Querying Specific Room");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      const room = sdk.getRoom(newRooms[0].id);
      if (room) {
        console.log(`Room ID: ${room.id}`);
        console.log(`Name: ${room.name}`);
        console.log(`Description: ${room.description || "N/A"}`);
        console.log(`Type: ${room.is_public ? "Public" : "Private"}`);
        console.log(`Created by: ${room.created_by}`);
        console.log(`Created at: ${room.created_at}`);
        console.log(`You are: ${room.is_owner ? "Owner" : "Member"}`);
      }
    }

    // Step 6: Delete rooms
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🗑️  Cleaning Up (Deleting Rooms)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    await deleteRooms(sdk, newRooms);

    // Wait for deletion events to process
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 7: Final room status
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Final Room Status");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    await displayRoomStatus(sdk);

    console.log("\n✅ Room management example completed!");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    // Disconnect
    console.log("\n👋 Disconnecting...");
    sdk.disconnect();
    console.log("✅ Disconnected");
  }
}

function setupEventListeners(sdk: TeneoSDK) {
  // Room created
  sdk.on("room:created", (room) => {
    console.log(`  ✅ Room created: "${room.name}" (${room.id})`);
  });

  // Room updated
  sdk.on("room:updated", (room) => {
    console.log(`  ✅ Room updated: "${room.name}" (${room.id})`);
  });

  // Room deleted
  sdk.on("room:deleted", (roomId) => {
    console.log(`  ✅ Room deleted: ${roomId}`);
  });

  // Room errors
  sdk.on("room:create_error", (error) => {
    console.error(`  ❌ Failed to create room: ${error.message}`);
  });

  sdk.on("room:update_error", (error, roomId) => {
    console.error(`  ❌ Failed to update room ${roomId}: ${error.message}`);
  });

  sdk.on("room:delete_error", (error, roomId) => {
    console.error(`  ❌ Failed to delete room ${roomId}: ${error.message}`);
  });
}

async function displayRoomStatus(sdk: TeneoSDK) {
  const ownedRooms = sdk.getOwnedRooms();
  const sharedRooms = sdk.getSharedRooms();
  const roomLimit = sdk.getRoomLimit();
  const roomCount = sdk.getOwnedRoomCount();

  console.log(`Room Capacity: ${roomCount}/${roomLimit} rooms used`);
  console.log(`Can create more rooms: ${sdk.canCreateRoom() ? "✅ Yes" : "❌ No (limit reached)"}`);

  console.log(`\n📁 Owned Rooms (${ownedRooms.length}):`);
  if (ownedRooms.length === 0) {
    console.log("  (none)");
  } else {
    ownedRooms.forEach((room, i) => {
      console.log(`  ${i + 1}. "${room.name}" - ${room.is_public ? "Public" : "Private"}`);
      console.log(`     ID: ${room.id}`);
      if (room.description) {
        console.log(`     Description: ${room.description}`);
      }
    });
  }

  console.log(`\n🤝 Shared Rooms (${sharedRooms.length}):`);
  if (sharedRooms.length === 0) {
    console.log("  (none)");
  } else {
    sharedRooms.forEach((room, i) => {
      console.log(`  ${i + 1}. "${room.name}" - ${room.is_public ? "Public" : "Private"}`);
      console.log(`     ID: ${room.id}`);
      console.log(`     Created by: ${room.created_by}`);
    });
  }
}

async function createSampleRooms(sdk: TeneoSDK) {
  const newRooms = [];

  // Check if we can create rooms
  if (!sdk.canCreateRoom()) {
    console.log("⚠️  Cannot create rooms - limit reached");
    console.log(`   Current: ${sdk.getOwnedRoomCount()}/${sdk.getRoomLimit()}`);
    return newRooms;
  }

  try {
    // Create room 1: Private crypto research room
    console.log("Creating 'Crypto Research' room...");
    const cryptoRoom = await sdk.createRoom({
      name: "Crypto Research",
      description: "Room for cryptocurrency analysis and tracking",
      isPublic: false
    });
    newRooms.push(cryptoRoom);

    // Create room 2: Public gaming room (if we have capacity)
    if (sdk.canCreateRoom()) {
      console.log("Creating 'Gaming Hub' room...");
      const gamingRoom = await sdk.createRoom({
        name: "Gaming Hub",
        description: "Public room for gaming-related AI agents",
        isPublic: true
      });
      newRooms.push(gamingRoom);
    }

    // Create room 3: Research room (if we have capacity)
    if (sdk.canCreateRoom()) {
      console.log("Creating 'AI Research' room...");
      const researchRoom = await sdk.createRoom({
        name: "AI Research",
        description: "Room for AI research and experimentation"
      });
      newRooms.push(researchRoom);
    }
  } catch (error: any) {
    console.error(`Failed to create room: ${error.message}`);
  }

  return newRooms;
}

async function updateRoomExample(sdk: TeneoSDK, roomId: string) {
  try {
    const originalRoom = sdk.getRoom(roomId);
    if (!originalRoom) {
      console.log("  ⚠️  Room not found");
      return;
    }

    console.log(`Original room name: "${originalRoom.name}"`);
    console.log(`Original description: "${originalRoom.description || "N/A"}"`);

    console.log("\nUpdating room...");
    const updatedRoom = await sdk.updateRoom(roomId, {
      name: `${originalRoom.name} (Updated)`,
      description: "This room was updated via the SDK v2.0 API"
    });

    console.log(`\nNew room name: "${updatedRoom.name}"`);
    console.log(`New description: "${updatedRoom.description}"`);
  } catch (error: any) {
    console.error(`Failed to update room: ${error.message}`);
  }
}

async function deleteRooms(sdk: TeneoSDK, rooms: any[]) {
  if (rooms.length === 0) {
    console.log("No rooms to delete");
    return;
  }

  console.log(`Deleting ${rooms.length} room(s)...\n`);

  for (const room of rooms) {
    try {
      console.log(`Deleting "${room.name}" (${room.id})...`);
      await sdk.deleteRoom(room.id);
      // Wait a bit between deletions
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error: any) {
      console.error(`Failed to delete room ${room.id}: ${error.message}`);
    }
  }
}

// Run the example
main().catch(console.error);
