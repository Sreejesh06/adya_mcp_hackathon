#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import existing tools
import { createGitHubSearchTool } from "./tools/search_github.js";
import { createNpmSearchTool } from "./tools/search_npm.js";
import { createPyPISearchTool } from "./tools/search_pypi.js";
import { createStackOverflowSearchTool } from "./tools/search_stackoverflow.js";
import { createMDNSearchTool } from "./tools/search_mdn.js";
import { createSearchAllTool } from "./tools/search_all.js";

// Import new tools
import { createRustCratesSearchTool } from "./tools/search_rust_crates.js";
import { createGoPackagesSearchTool } from "./tools/search_go_packages.js";
import { createDevDocsSearchTool } from "./tools/search_devdocs.js";
import { createAwesomeListsSearchTool } from "./tools/search_awesome_lists.js";
import { createRedditProgrammingSearchTool } from "./tools/search_reddit_programming.js";
import { createYoutubeTutorialsSearchTool } from "./tools/search_youtube_tutorials.js";
import { createTechBlogsSearchTool } from "./tools/search_tech_blogs.js";

// ================ INTERFACES ================
interface ProviderCredentials {
  github?: string;
  npm?: string;
  stackoverflow?: string;
  youtube?: string;
}

// Helper function to extract credentials from tool arguments
function extractCredentials(args: any): ProviderCredentials {
  return {
    github: args.github_token,
    npm: args.npm_token,
    stackoverflow: args.stackoverflow_access_token,
    youtube: args.youtube_api_key,
  };
}

// ================ SERVER INIT ================
// Create server instance
const server = new McpServer({
  name: "CODE-RESEARCH",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register existing tools
createGitHubSearchTool(server);
createNpmSearchTool(server);
createPyPISearchTool(server);
createStackOverflowSearchTool(server);
createMDNSearchTool(server);
createSearchAllTool(server);

// Register new tools
createRustCratesSearchTool(server);
createGoPackagesSearchTool(server);
createDevDocsSearchTool(server);
createAwesomeListsSearchTool(server);
createRedditProgrammingSearchTool(server);
createYoutubeTutorialsSearchTool(server);
createTechBlogsSearchTool(server);

// ================ TOOL CREDENTIAL MAPPING ================
// Tool-specific credential requirements:
//
// 🔐 Tools that require specific credentials:
// - search_github: GITHUB_TOKEN only
// - search_npm: NPM_TOKEN only  
// - search_stackoverflow: STACKOVERFLOW_ACCESS_TOKEN, STACKOVERFLOW_CLIENT_ID, STACKOVERFLOW_CLIENT_SECRET (all optional)
// - search_youtube_tutorials: YOUTUBE_API_KEY only
// - search_all: All credentials (composite tool)
//
// 🆓 Tools that work without credentials (public APIs):
// - search_pypi, search_mdn, search_rust_crates, search_go_packages
// - search_devdocs, search_awesome_lists, search_reddit_programming
// - search_tech_blogs
//
// 📋 Benefits of tool-specific credentials:
// - Security: Each tool only receives needed credentials
// - Performance: Reduced credential overhead
// - Auditability: Clear credential usage tracking

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);