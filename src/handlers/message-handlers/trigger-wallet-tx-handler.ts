/**
 * Handler for trigger_wallet_tx messages
 * Server sends this when an agent requires an on-chain transaction
 */

import { TriggerWalletTxMessage, TriggerWalletTxMessageSchema } from "../../types";
import { BaseMessageHandler } from "./base-handler";
import { HandlerContext } from "./types";

export class TriggerWalletTxHandler extends BaseMessageHandler<TriggerWalletTxMessage> {
  readonly type = "trigger_wallet_tx" as const;
  readonly schema = TriggerWalletTxMessageSchema;

  protected handleValidated(message: TriggerWalletTxMessage, context: HandlerContext): void {
    const { from, data, room } = message;

    context.logger.debug("Handling trigger_wallet_tx", {
      from,
      taskId: data.task_id,
      tx: data.tx
    });

    context.logger.info("Wallet transaction requested", {
      agentName: from,
      taskId: data.task_id,
      to: data.tx.to,
      value: data.tx.value,
      chainId: data.tx.chainId
    });

    // Emit wallet tx requested event
    this.emit(context, "wallet:tx_requested", {
      taskId: data.task_id,
      agentName: from,
      tx: data.tx,
      description: data.description,
      optional: data.optional ?? false,
      room
    });

    // Send webhook
    this.sendWebhook(context, "wallet_tx_requested", {
      taskId: data.task_id,
      agentName: from,
      tx: data.tx,
      description: data.description,
      optional: data.optional,
      room
    });
  }
}
