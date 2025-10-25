# Integration Tests

This directory contains integration tests for the Teneo Protocol SDK that test against real WebSocket servers.

## Setup

### 1. Configure Test Credentials

Copy the example environment file:

```bash
cp ../../.env.test.example ../../.env.test
```

Edit `.env.test` and add your credentials:

```env
WS_URL=wss://your-teneo-server.com/ws
WALLET_ADDRESS=0xYourWalletAddressHere
PRIVATE_KEY=your_private_key_here_without_0x_prefix
```

**⚠️ Security Warning:** Never commit `.env.test` or any file containing real credentials to version control!

### 2. Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm run test:integration tests/integration/real-server.test.ts

# Run with verbose output
npm run test:integration -- --reporter=verbose
```

## Test Files

- **`real-server.test.ts`** - Tests against real Teneo WebSocket server
  - WebSocket connection
  - Wallet-based authentication
  - Agent listing
  - Message sending and receiving

- **`websocket.test.ts`** - Local WebSocket mock tests

## Notes

- Tests will be automatically skipped if credentials are not provided
- The `.env.test` file is ignored by git for security
- Integration tests may take longer to run (60-120 seconds)
- Some tests may fail if the server configuration changes

## Troubleshooting

**Tests are skipped:**

- Ensure `.env.test` exists and contains valid credentials
- Check that all required environment variables are set

**Connection timeout:**

- Verify the WebSocket URL is correct and accessible
- Check your network connection

**Authentication errors:**

- Ensure your private key matches the wallet address
- Verify the wallet is authorized on the server

## Current Test Status

As of the latest run:

- ✅ 3/10 tests passing
- Core functionality (connection, authentication) working
- Some tests depend on server sending agent list (may vary by server config)
