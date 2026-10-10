export type WebSearchConfig = {
  enabled: boolean;
  allowed_domains?: string[];
  excluded_domains?: string[];
  max_results?: number;
};

export type ApiTool = {
  name: string;
  description: string;
  method: "GET" | "POST";
  url: string; // may contain {param} placeholders
  headers?: Record<string, string>;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type WidgetConfig = {
  title: string;
  greeting: string;
  color: string;
  position: "left" | "right";
  suggestions: string[];
};

export type Client = {
  id: string;
  slug: string;
  name: string;
  context: string;
  model: string;
  temperature: number;
  web_search: WebSearchConfig;
  tools: ApiTool[];
  widget: WidgetConfig;
  allowed_origins: string[];
  handoff_message: string;
  active: boolean;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type SourceRef = { title: string; url?: string };
