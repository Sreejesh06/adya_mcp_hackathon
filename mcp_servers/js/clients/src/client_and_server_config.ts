export const ClientsConfig:any = [
    "MCP_CLIENT_OPENAI",
    "MCP_CLIENT_AZURE_AI",
    "MCP_CLIENT_GEMINI",
    // "CLAUDE",
]

export const ServersConfig: any = [
  {
    server_name: "WORDPRESS",
    server_features_and_capability: "WORDPRESS",
    path: "build/index.js", // WordPress build
  },
  {
    server_name: "PINTEREST", // Pinterest build
    server_features_and_capability: "PINTEREST",
    path: "build/index.js", // same structure
  },
  {
    server_name: "WAYBACK",
    server_features_and_capability: "WAYBACK",
    path: "build/index.js", // Wayback Machine build
  },
  {
    server_name: "OMNISEARCH",
    server_features_and_capability: "OMNISEARCH - Unified access to multiple search providers and AI tools (Tavily, Brave, Kagi, Perplexity, Jina AI, Firecrawl)",
    path: "build/index.js", // Omnisearch build
  },{
    server_name: "CODE-RESEARCH",
    server_features_and_capability: "CODE-RESEARCH",
    path: "build/index.js", // CODE-RESEARCH build
  },
  {
    server_name: "BIGGO",
    server_features_and_capability: "BIGGO",
    path: "build/index.js", // BigGo build
  }
];

