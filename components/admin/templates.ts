// Starting points per business type. Everything is editable after creation.

type Template = {
  label: string;
  hint: string;
  config: {
    context: string;
    model: string;
    temperature: number;
    web_search: { enabled: boolean; allowed_domains: string[]; excluded_domains: string[]; max_results: number };
    widget: { title: string; greeting: string; color: string; position: "left" | "right"; suggestions: string[] };
    handoff_message: string;
  };
};

const base = {
  model: "openai/gpt-6-luna",
  temperature: 0.3,
  web_search: { enabled: false, allowed_domains: [], excluded_domains: [], max_results: 5 },
};

export const TEMPLATES: Record<string, Template> = {
  general: {
    label: "General business",
    hint: "A friendly all-purpose support assistant. Add your FAQs and website.",
    config: {
      ...base,
      context: `{{name}} — describe what the company does, who its customers are, and anything the assistant must always or never say.

Tone: warm, clear and professional.
Support hours: (fill in)
Contact: (email / phone for human help)`,
      widget: { title: "Support", greeting: "Hi! 👋 How can I help you today?", color: "#2563eb", position: "right", suggestions: [] },
      handoff_message: "I'm not sure about that one. Please contact our team and they'll help you out.",
    },
  },
  ecommerce: {
    label: "Online store",
    hint: "Shipping, returns, products and order status. Add an order-lookup tool under Live APIs.",
    config: {
      ...base,
      context: `{{name}} is an online store.

- Help customers with products, sizing, shipping, returns, refunds and order status.
- For order status, ask for the order number (and email if the tool needs it) and use the order lookup tool.
- Never promise delivery dates or refunds beyond what the policy says.
- Shipping policy: (fill in)
- Return policy: (fill in)`,
      widget: { title: "Help & orders", greeting: "Hi! I can help with orders, shipping, returns and products.", color: "#16a34a", position: "right", suggestions: ["Where is my order?", "What's your return policy?", "How long does shipping take?"] },
      handoff_message: "I couldn't find that. Please reach our support team and include your order number.",
    },
  },
  saas: {
    label: "Software / SaaS",
    hint: "Product how-tos, billing and troubleshooting. Crawl your docs site; web search can cover integrations.",
    config: {
      ...base,
      web_search: { enabled: true, allowed_domains: [], excluded_domains: [], max_results: 4 },
      context: `{{name}} is a software product.

- Help users set up, use and troubleshoot the product. Give step-by-step instructions.
- For billing or account changes, explain how in the product, and hand off to the team for anything you can't do.
- For third-party integrations, you may search the web but prefer official documentation.
- Plans and pricing: (fill in or crawl the pricing page)`,
      widget: { title: "Help center", greeting: "Hi! Ask me anything about the product — setup, features or billing.", color: "#7c3aed", position: "right", suggestions: ["How do I get started?", "How do I change my plan?"] },
      handoff_message: "I'm not certain about that. Please open a ticket with our support team.",
    },
  },
  services: {
    label: "Local business / services",
    hint: "Hours, locations, pricing and bookings for clinics, salons, restaurants, agencies.",
    config: {
      ...base,
      context: `{{name}} is a local business.

- Answer questions about services, prices, opening hours, locations and how to book.
- Do not give medical, legal or financial advice; suggest booking a consultation instead.
- Address: (fill in)
- Hours: (fill in)
- Booking link / phone: (fill in)`,
      widget: { title: "Ask us", greeting: "Hello! How can we help you today?", color: "#ea580c", position: "right", suggestions: ["What are your opening hours?", "How do I book?"] },
      handoff_message: "I don't have that information. Please call or message us directly and we'll help.",
    },
  },
};
