/**
 * Output contracts for the two LLM tasks. Each has:
 *  - a Zod schema that we validate every model response against (never trust model output), and
 *  - a JSON-Schema "tool" definition used to force structured output from the provider.
 */
import { z } from 'zod';
import { CATEGORIES, PRIORITIES } from '../config/constants.js';

export const triageOutputSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1).catch(0.7),
  rationale: z.string().trim().min(1).max(300),
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;

export const ESCALATION_TEAMS = ['none', 'production', 'distribution', 'finance', 'printing'] as const;

export const draftOutputSchema = z.object({
  reply: z.string().trim().min(40).max(3500),
  verify_before_sending: z.array(z.string().trim().min(1).max(200)).max(6).catch([]),
  needs_escalation: z.boolean().catch(false),
  escalation_team: z.enum(ESCALATION_TEAMS).catch('none'),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  schema: Record<string, unknown>;
}

export const triageTool: ToolDefinition = {
  name: 'classify_ticket',
  description: 'Record the category and priority of the support ticket.',
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...CATEGORIES] },
      priority: { type: 'string', enum: [...PRIORITIES] },
      confidence: { type: 'number', description: '0 to 1 — how sure you are of the category.' },
      rationale: { type: 'string', description: 'At most 20 words explaining the category and priority.' },
    },
    required: ['category', 'priority', 'confidence', 'rationale'],
  },
};

export const draftTool: ToolDefinition = {
  name: 'write_reply',
  description: 'Return the drafted reply to the author plus anything the human reviewer must verify.',
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'The reply body (no signature).' },
      verify_before_sending: {
        type: 'array',
        items: { type: 'string' },
        description: 'Facts the reply depends on that are NOT in the provided data and must be checked by the reviewer.',
      },
      needs_escalation: { type: 'boolean', description: 'true if the reply commits BookLeaf to an internal escalation.' },
      escalation_team: { type: 'string', enum: [...ESCALATION_TEAMS] },
    },
    required: ['reply', 'verify_before_sending', 'needs_escalation', 'escalation_team'],
  },
};
