/**
 * Agent category constants and Zod schemas
 * Enables agents to be tagged with up to 2 categories for better discoverability
 */

import { z } from "zod";

/**
 * Predefined agent categories for classification
 */
export const AGENT_CATEGORIES = [
  "Trading",
  "Finance",
  "Crypto",
  "Social Media",
  "Lead Generation",
  "E-Commerce",
  "SEO",
  "News",
  "Real Estate",
  "Travel",
  "Automation",
  "Developer Tools",
  "AI",
  "Integrations",
  "Open Source",
  "Jobs",
  "Price Lists",
  "Other"
] as const;

/**
 * Maximum number of categories an agent can have
 */
export const MAX_CATEGORIES = 2;

/**
 * Zod schema for validating a single agent category
 */
export const AgentCategorySchema = z.enum(AGENT_CATEGORIES);

/**
 * TypeScript type for a single agent category
 */
export type AgentCategory = z.infer<typeof AgentCategorySchema>;
