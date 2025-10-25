/**
 * Handler for challenge messages
 * Handles authentication challenge-response flow
 */

import { ChallengeMessage, ChallengeMessageSchema, createAuth } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class ChallengeHandler extends BaseMessageHandler<ChallengeMessage> {
  readonly type = "challenge" as const;
  readonly schema = ChallengeMessageSchema;
  private clientType: "user" | "agent" | "coordinator";

  constructor(clientType: "user" | "agent" | "coordinator" = "user") {
    super();
    this.clientType = clientType;
  }

  protected async handleValidated(
    message: ChallengeMessage,
    context: HandlerContext
  ): Promise<void> {
    if (!context.account) {
      context.logger.error("Received challenge but no account configured");
      return;
    }

    const challenge = message.data.challenge;
    context.logger.debug("Received authentication challenge");

    // Update auth state with challenge
    this.updateAuthState(context, {
      challenge,
      challengeTimestamp: message.data.timestamp
    });

    // Emit challenge event
    this.emit(context, "auth:challenge", challenge);

    try {
      // Sign challenge
      const messageToSign = `Teneo authentication challenge: ${challenge}`;
      const signature = await context.account.signMessage({
        message: messageToSign
      });

      // Send authentication
      await context.sendMessage(
        createAuth(context.account.address, signature, messageToSign, this.clientType)
      );
    } catch (error) {
      context.logger.error("Failed to sign challenge", error);
      this.emit(context, "auth:error", "Failed to sign challenge");
    }
  }
}
