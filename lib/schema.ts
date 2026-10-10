import { z } from "zod";

const toolSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1000),
  method: z.enum(["GET", "POST"]).default("GET"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  parameters: z
    .object({
      type: z.literal("object"),
      properties: z.record(z.string(), z.any()),
      required: z.array(z.string()).optional(),
    })
    .default({ type: "object", properties: {} }),
});

/** Everything that defines a client bot. Also the format for JSON import/export. */
export const clientInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only").min(2).max(48),
  name: z.string().min(1).max(120),
  context: z.string().max(30000).default(""),
  model: z.string().min(3).default("openai/gpt-6-luna"),
  temperature: z.number().min(0).max(1.5).default(0.3),
  web_search: z
    .object({
      enabled: z.boolean().default(false),
      allowed_domains: z.array(z.string()).default([]),
      excluded_domains: z.array(z.string()).default([]),
      max_results: z.number().int().min(1).max(10).default(5),
    })
    .default({ enabled: false, allowed_domains: [], excluded_domains: [], max_results: 5 }),
  tools: z.array(toolSchema).max(20).default([]),
  widget: z
    .object({
      title: z.string().max(60).default("Support"),
      greeting: z.string().max(500).default("Hi! How can I help you today?"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
      position: z.enum(["left", "right"]).default("right"),
      suggestions: z.array(z.string().max(80)).max(6).default([]),
    })
    .default({ title: "Support", greeting: "Hi! How can I help you today?", color: "#2563eb", position: "right", suggestions: [] }),
  allowed_origins: z.array(z.string()).default([]),
  handoff_message: z.string().max(500).default("I'm not sure about that. Let me connect you with our team."),
  active: z.boolean().default(true),
  // Optional knowledge to ingest on import: urls to crawl and raw text snippets.
  knowledge: z
    .object({
      urls: z.array(z.object({ url: z.string().url(), max_pages: z.number().int().min(1).max(200).default(25), path_prefix: z.string().optional() })).default([]),
      texts: z.array(z.object({ name: z.string(), content: z.string() })).default([]),
    })
    .optional(),
});

export type ClientInput = z.infer<typeof clientInput>;
