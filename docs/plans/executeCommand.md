# Plan: `executeCommand` — roomless direct agent execution

> **For the fresh session picking this up:** this plan is self-contained. You don't need prior chat context. Read top-to-bottom and follow the acceptance checklist at the end.
>
> **Tracking issue:** https://github.com/Teneo-Protocol/teneo-websocket-ai-core/issues/407
> **ADR (architectural context, optional reading):** https://github.com/Teneo-Protocol/teneo-websocket-ai-core/issues/403

---

## Goal

Add a new public method `executeCommand` to `TeneoSDK` that performs a one-shot direct agent call with **no room**. Behaves exactly like the existing `sendDirectCommand`, minus the room requirement.

```typescript
sdk.executeCommand({
  agent: 'x-agent-enterprise-v2',
  command: 'user @elonmusk',
  network?: 'base',           // optional, same semantics as sendDirectCommand
}, waitForResponse?: boolean): Promise<FormattedResponse | void>
```

## Non-goals

- **Do not** remove or deprecate `sendDirectCommand`. Chat-style consumers (multi-turn, history, multi-agent rooms) still use it.
- **Do not** refactor the server-side sentinel (`__api_explorer__`). That's a separate tracking issue (#404). `executeCommand` ships on the current server behavior and will transparently benefit from the sentinel cleanup later.
- **Do not** add roomless history persistence. That's issue #406 — out of scope here; `executeCommand` calls are ephemeral.
- **Do not** build streaming support. Streaming has its own plan (`teneo-agent-skills/docs/superpowers/plans/2026-04-10-token-streaming.md`).

---

## Background: why this is safe

The server already supports roomless direct execution via the `api_execute` message type. Today it's consumed only by the API explorer page in `community-agent-chat/apps/web` (via a hook, not the SDK). Server handler: `internal/websocket/handler_api_explorer.go`.

Server flow for `api_execute`:

1. Receives `api_execute` message with `content: "@<agentId> <command>"`, no room.
2. Validates the user is authenticated.
3. Looks up agent directly via `hub.FindAgentByID` — no room membership check.
4. If payments enabled (`X402_ENABLED=true`): generates a `task_quote` via `handleApiExplorerQuote`. Client confirms via `confirm_task` (same as room-based flow) with payment header.
5. If payments disabled: executes directly via `handleApiExplorerDirect`.
6. Response comes back via `api_execute_response` message type.

**Consequence for the SDK:** we wire a new message type on the wire, but the quote-confirm and payment machinery already works identically. Most of the work is plumbing, not new logic.

---

## SDK changes

All paths are relative to `teneo-sdk/`.

### 1. Type additions

**`src/types/messages.ts`**

- Add `"api_execute"` to the outgoing message type union.
- Add `"api_execute_response"` to the incoming message type union.
- Define `ApiExecuteMessage` and `ApiExecuteResponseMessage` types. Fields to include on outgoing:
  - `type: "api_execute"`
  - `content: string` (the `@<agent> <command>` string — caller passes `agent` + `command` separately, we assemble)
  - `from: string` (sender wallet)
  - `timestamp: string`
  - `request_id?: string` (client correlation ID, same pattern as elsewhere)
  - `data?: { network?: string }` (optional per-request network override)

- Add `messages.test.ts` cases mirroring the existing shape tests.

### 2. Public method on `TeneoSDK`

**`src/teneo-sdk.ts`**

- Add `executeCommand` next to `sendDirectCommand` (currently at `teneo-sdk.ts:433`).
- Signature:

```typescript
public async executeCommand(
  options: {
    agent: string;
    command: string;
    network?: string | number;
  },
  waitForResponse: boolean = false
): Promise<FormattedResponse | void> {
  return this.messages.executeCommand(options, waitForResponse);
}
```

- Docstring: describe it as roomless, useful for programmatic/agent consumers, notes payment auto-confirm behavior matches `sendDirectCommand`.

### 3. Router implementation

**`src/managers/message-router.ts`**

- Add `executeCommand` method.
- Build the wire message:
  - Validate inputs via existing Zod schemas (`AgentIdSchema`, `AgentCommandContentSchema`). Do **not** require `RoomIdSchema`.
  - Assemble `content` as `` `@${agent} ${command}` `` (matching what the server parses in `matchAgentFromCommand`).
  - Generate a client request ID via whatever the existing pattern is (check `sendDirectCommand`'s implementation).
- Payment path (when payments enabled):
  - Reuse the existing quote handler. The server will emit a `task_quote` in response to `api_execute` — SDK listens for it by correlation ID, auto-confirms via existing `confirmQuote` mechanism.
  - Reuse existing payment-header generation (whatever `sendDirectCommand` uses; likely `useSmartAccount` / `generatePaymentHeader` equivalents).
- No-payment path: fire-and-forget if `waitForResponse === false`, else await the `api_execute_response`.
- Response: route via the existing response-formatter so shape matches `sendDirectCommand`.

### 4. Response handler

**`src/handlers/message-handlers/`**

- Check whether existing `task-response-handler.ts` or `regular-message-handler.ts` covers `api_execute_response`. Most likely we need to either:
  - Register `api_execute_response` as an alias for the task-response flow, or
  - Add a dedicated handler `api-execute-response-handler.ts` modeled on `task-response-handler.ts`.
- Register in `handler-registry.ts`.

### 5. Examples

**`examples/`** (if the directory's convention is per-feature files)

- Add a minimal `execute-command.ts` example showing one-shot usage with and without `waitForResponse`.

### 6. Tests

**Unit (required):**
- Follow the pattern in `src/teneo-sdk.streaming-events.test.ts` and `src/managers/message-router-streaming.test.ts`.
- Mock the WebSocket client, verify:
  - Correct wire shape for `api_execute` (no room field).
  - Quote-confirm flow triggers and auto-confirms.
  - `waitForResponse: true` resolves on `api_execute_response`.
  - Validation errors for empty agent / empty command.

**Integration (required):**
- Create `tests/integration/execute-command.test.ts` (or match existing integration pattern).
- Against a running server: call `executeCommand` without creating a room, assert response comes back.
- If feasible: a paid flow test that verifies the quote → auto-confirm → settle → response sequence.

### 7. Docs

- **README.md:** add a section for `executeCommand` next to `sendDirectCommand`. Make clear the difference: *use `executeCommand` for one-shot programmatic calls, use `sendDirectCommand` / `sendMessage` for chat-style flows with persistence.*
- **CHANGELOG.md:** new minor version entry.
- **CONCEPTS.md:** if this file talks about rooms, add a short paragraph referencing the primitive (user→agent→response) with rooms as a persistence/thread context. Keep it short — the detailed model lives in the server ADR (issue #403).

---

## Cross-repo follow-up: `teneo-agent-skills`

The CLI and docs in `Teneo-Protocol/teneo-agent-skills` currently thread a `room` through every direct agent call. After `executeCommand` ships, update:

- **`src/discover-agents.ts`** (around lines 363 and 393): codegen currently emits `sdk.sendMessage("@agent-id command args", { room: roomId, ... })`. Change to `sdk.executeCommand({ agent: "agent-id", command: "command args" }, true)`.
- **`README.md`** (around line 76) and **`templates/README.template.md`** (around line 79): update the example from `sdk.sendMessage(..., { room: roomId })` to `sdk.executeCommand(...)`.
- **`templates/cli/index.ts`** (see the `Using room: ...` log at line ~594 and the `confirmQuotedPrice` flow at ~298, ~779): the CLI currently picks a room, joins it, and sends commands through it. For direct agent invocations (the CLI's primary use case), switch to `executeCommand`. This is a user-visible simplification: users no longer need to know a room exists for one-shot CLI calls.
- **`templates/cli/daemon.ts`** (quote cache at line ~142 keys on `(message, room, chain)`): adjust the cache key to `(message, agent, chain)` since room no longer applies for direct-mode calls.

Do this in a separate PR in `teneo-agent-skills`, depending on a published SDK version containing `executeCommand`.

---

## Wire-protocol reference (for the implementer)

**Outgoing from SDK:**

```json
{
  "type": "api_execute",
  "content": "@x-agent-enterprise-v2 user @elonmusk",
  "from": "0xUSERWALLET...",
  "timestamp": "2026-04-20T12:34:56.789Z",
  "request_id": "client-generated-correlation-id",
  "data": { "network": "base" }
}
```

**Server response (payments disabled):**

```json
{
  "type": "api_execute_response",
  "content": "...agent response...",
  "from": "x-agent-enterprise-v2",
  "timestamp": "...",
  "request_id": "client-generated-correlation-id"
}
```

**Server response (payments enabled):**

1. First, a `task_quote` message (same shape as existing quote flow).
2. Client auto-confirms via `confirm_task` with payment header.
3. Server emits `api_execute_response` after settlement + agent response.

**Server source of truth:** `internal/websocket/handler_api_explorer.go` (~200 lines — read it first).

---

## Acceptance checklist

Before opening the SDK PR:

- [ ] `executeCommand` method exists on `TeneoSDK`
- [ ] Router + type + handler wiring complete
- [ ] Unit tests cover: wire shape, validation, quote auto-confirm, waitForResponse paths
- [ ] Integration test passes against running server (no-payment path minimum)
- [ ] README + CHANGELOG updated
- [ ] `sendDirectCommand` unchanged and still works (regression test)
- [ ] Lint + typecheck pass
- [ ] Example in `examples/` runs successfully

Before opening the `teneo-agent-skills` PR (separate, after SDK ships):

- [ ] SDK version bumped in `teneo-agent-skills/package.json`
- [ ] Codegen emits `executeCommand` examples
- [ ] CLI direct-command path uses `executeCommand`
- [ ] Daemon quote cache keys on agent, not room
- [ ] CLI smoke test: one-shot direct call works without any room argument
- [ ] README + template README updated

---

## Questions to resolve in-session (not blocking — make a call and document it)

1. **Method name.** Plan uses `executeCommand`. Alternative considered: `sendExecuteCommand` (for symmetry with `sendMessage` / `sendDirectCommand`). Pick one and stick with it across the PR.
2. **Dedicated vs shared response handler.** Whether `api_execute_response` gets its own handler file or piggybacks on the task-response handler is an implementation detail — pick whichever reuses more existing code.
3. **Payment header generation.** Check how `sendDirectCommand` obtains the payment header today. The same path should work; if not, note why in the PR description.

---

## Out of scope / future

- Opt-in roomless history persistence (#406).
- Sentinel refactor on the server (#404) — lands later, transparent to SDK callers.
- Agent visibility decoupling on the server (#405) — will affect which agents are callable via `executeCommand` (verification filter may gain teeth). Not a blocker; document in README if behavior changes.
