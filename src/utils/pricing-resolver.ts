import { Agent, CommandPricing } from "../types";

const VALID_PRICE_TYPES = ["free", "per-query", "per-item", "time-based-task"] as const;
type PriceType = (typeof VALID_PRICE_TYPES)[number];

export interface ResolvedPricing {
  pricePerUnit: number;
  priceType: PriceType;
  taskUnit?: string;
  timeUnit?: "hour" | "day";
  totalPrice: number;
  itemCount?: number;
  duration?: number;
}

export interface PriceResolutionOptions {
  commandTrigger?: string;
  itemCount?: number;
  duration?: number;
}

function isValidPriceType(type: string): type is PriceType {
  return VALID_PRICE_TYPES.includes(type as PriceType);
}

export function resolveAgentPricing(
  agent: Agent,
  options: PriceResolutionOptions = {}
): ResolvedPricing | null {
  const { commandTrigger, itemCount = 1, duration = 1 } = options;

  // Validate itemCount and duration are positive
  if (itemCount < 0 || duration < 0) {
    return null;
  }

  let pricing: CommandPricing | undefined;

  if (commandTrigger && agent.commands) {
    const command = agent.commands.find(
      (cmd) => cmd.trigger.toLowerCase() === commandTrigger.toLowerCase()
    );
    pricing = command?.pricing;
  }

  if (!pricing) {
    return null;
  }

  const rawPriceType = pricing.priceType || "free";
  const priceType: PriceType = isValidPriceType(rawPriceType) ? rawPriceType : "free";
  const pricePerUnit = pricing.pricePerUnit || 0;

  // Reject negative prices
  if (pricePerUnit < 0) {
    return null;
  }

  if (priceType === "free" || pricePerUnit === 0) {
    return {
      pricePerUnit: 0,
      priceType: "free",
      totalPrice: 0
    };
  }

  let totalPrice: number;

  switch (priceType) {
    case "per-query":
      totalPrice = pricePerUnit;
      break;
    case "per-item":
      totalPrice = pricePerUnit * itemCount;
      break;
    case "time-based-task":
      totalPrice = pricePerUnit * duration;
      break;
    default:
      totalPrice = pricePerUnit;
  }

  return {
    pricePerUnit,
    priceType,
    taskUnit: pricing.taskUnit,
    timeUnit: pricing.timeUnit,
    totalPrice,
    itemCount: priceType === "per-item" ? itemCount : undefined,
    duration: priceType === "time-based-task" ? duration : undefined
  };
}

export function parseCommandForPricing(content: string): {
  agentName?: string;
  commandTrigger?: string;
  itemCount?: number;
  duration?: number;
} {
  const directCommandMatch = content.match(/^@(\S+)\s+(.+)$/);
  if (!directCommandMatch) {
    return {};
  }

  const agentName = directCommandMatch[1];
  const commandContent = directCommandMatch[2];

  const parts = commandContent.trim().split(/\s+/);
  const commandTrigger = parts[0];
  const args = parts.slice(1);

  let itemCount: number | undefined;
  let duration: number | undefined;

  for (const arg of args) {
    const numMatch = arg.match(/^(\d+)$/);
    if (numMatch) {
      itemCount = parseInt(numMatch[1], 10);
    }

    const durationMatch = arg.match(/^(\d+)(h|d)$/i);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10);
    }
  }

  return { agentName, commandTrigger, itemCount, duration };
}
