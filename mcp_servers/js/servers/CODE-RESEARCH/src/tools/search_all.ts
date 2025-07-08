// TODO: Implement search_all tool
// Will follow the same pattern as search_github.ts
// Executes all search tools in parallel and aggregates results

import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Search result interface
interface SearchResult {
  source: string;
  results: string;
  error?: string;
}

// Search all tool implementation
export function createSearchAllTool(server: any) {
  server.tool(
    "search_all",
    "Search across all available platforms simultaneously and aggregate results",
    {
      // Credential parameters
      github_token: z.string().optional().describe("GitHub Personal Access Token (optional)"),
      npm_token: z.string().optional().describe("NPM Registry Token (optional)"),
      stackoverflow_access_token: z.string().optional().describe("Stack Overflow Access Token (optional)"),
      stackoverflow_client_id: z.string().optional().describe("Stack Overflow OAuth Client ID (optional)"),
      stackoverflow_client_secret: z.string().optional().describe("Stack Overflow OAuth Client Secret (optional)"),
      youtube_api_key: z.string().optional().describe("YouTube Data API v3 Key (optional)"),
      // Search parameters
      query: z.string().describe("Search query to execute across all platforms"),
      limit: z.number().min(1).max(5).optional().default(3).describe("Maximum number of results per platform (1-5)"),
      platforms: z.array(z.enum([
        "github", "npm", "pypi", "stackoverflow", "mdn", 
        "rust_crates", "go_packages", "devdocs", "awesome_lists", 
        "reddit_programming", "youtube_tutorials", "tech_blogs"
      ])).optional().describe("Specific platforms to search (default: all)"),
    },
    async ({ 
      github_token, 
      npm_token, 
      stackoverflow_access_token,
      stackoverflow_client_id,
      stackoverflow_client_secret,
      youtube_api_key,
      query, 
      limit, 
      platforms 
    }: {
      github_token?: string;
      npm_token?: string;
      stackoverflow_access_token?: string;
      stackoverflow_client_id?: string;
      stackoverflow_client_secret?: string;
      youtube_api_key?: string;
      query: string;
      limit: number;
      platforms?: string[];
    }) => {
      try {
        // Create cache key
        const cacheKey = `search_all:${query}:${limit}:${platforms?.join(',') || 'all'}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `Search All Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Define all available search functions with credentials
        const searchFunctions = {
          github: () => searchGitHub(query, limit, github_token),
          npm: () => searchNpm(query, limit, npm_token),
          pypi: () => searchPyPI(query, limit),
          stackoverflow: () => searchStackOverflow(query, limit, stackoverflow_access_token, stackoverflow_client_id, stackoverflow_client_secret),
          mdn: () => searchMDN(query, limit),
          rust_crates: () => searchRustCrates(query, limit),
          go_packages: () => searchGoPackages(query, limit),
          devdocs: () => searchDevDocs(query, limit),
          awesome_lists: () => searchAwesomeLists(query, limit, github_token),
          reddit_programming: () => searchRedditProgramming(query, limit),
          youtube_tutorials: () => searchYoutubeTutorials(query, limit, youtube_api_key),
          tech_blogs: () => searchTechBlogs(query, limit)
        };

        // Determine which platforms to search
        const platformsToSearch = platforms || Object.keys(searchFunctions);
        const validPlatforms = platformsToSearch.filter(platform => searchFunctions[platform as keyof typeof searchFunctions]);

        if (validPlatforms.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No valid platforms specified for search.",
              },
            ],
          };
        }

        // Execute searches in parallel
        const searchPromises = validPlatforms.map(async (platform) => {
          try {
            const searchFunction = searchFunctions[platform as keyof typeof searchFunctions];
            const results = await searchFunction();
            return {
              source: platform,
              results: results,
              error: undefined
            };
          } catch (error) {
            return {
              source: platform,
              results: '',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        });

        const searchResults = await Promise.allSettled(searchPromises);
        
        // Process results
        const successfulResults: SearchResult[] = [];
        const failedResults: SearchResult[] = [];

        searchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value.error) {
              failedResults.push(result.value);
            } else {
              successfulResults.push(result.value);
            }
          } else {
            failedResults.push({
              source: validPlatforms[index],
              results: '',
              error: result.reason?.message || 'Promise rejected'
            });
          }
        });

        // Format output
        let outputText = `Search All Results for "${query}":\n\n`;
        outputText += `Platforms searched: ${validPlatforms.length}\n`;
        outputText += `Successful: ${successfulResults.length} | Failed: ${failedResults.length}\n\n`;

        // Add successful results
        if (successfulResults.length > 0) {
          outputText += "=== SUCCESSFUL SEARCHES ===\n\n";
          successfulResults.forEach(result => {
            outputText += `**${result.source.toUpperCase()}**\n`;
            outputText += `${result.results}\n\n`;
          });
        }

        // Add failed results summary
        if (failedResults.length > 0) {
          outputText += "=== FAILED SEARCHES ===\n\n";
          failedResults.forEach(result => {
            outputText += `**${result.source.toUpperCase()}**: ${result.error}\n`;
          });
          outputText += "\n";
        }

        outputText += `\nTotal platforms: ${validPlatforms.length} | Results per platform: ${limit}`;

        // Cache the result
        cache.set(cacheKey, outputText);

        return {
          content: [
            {
              type: "text",
              text: outputText,
            },
          ],
        };
      } catch (error) {
        const errorMessage = `Error in search_all: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
        };
      }
    }
  );
}

// Individual search functions that call the respective APIs
async function searchGitHub(query: string, limit: number, github_token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CODE-RESEARCH-MCP-Server'
  };

  if (github_token) {
    headers['Authorization'] = `Bearer ${github_token}`;
  }

  const response = await axios.get(
    'https://api.github.com/search/repositories',
    {
      headers,
      params: {
        q: query,
        sort: 'stars',
        order: 'desc',
        per_page: limit,
        page: 1
      },
      timeout: 10000
    }
  );

  const results = response.data.items.map((repo: any, index: number) => 
    `${index + 1}. ${repo.full_name} - ${repo.description || 'No description'} (⭐${repo.stargazers_count})`
  ).join('\n');

  return results || 'No repositories found';
}

async function searchNpm(query: string, limit: number, npm_token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'CODE-RESEARCH-MCP-Server'
  };

  if (npm_token) {
    headers['Authorization'] = `Bearer ${npm_token}`;
  }

  const response = await axios.get(
    `https://registry.npmjs.org/-/v1/search`,
    {
      headers,
      params: {
        text: query,
        size: limit
      },
      timeout: 10000
    }
  );

  const results = response.data.objects.map((pkg: any, index: number) => 
    `${index + 1}. ${pkg.package.name} - ${pkg.package.description || 'No description'} (📦${pkg.package.version})`
  ).join('\n');

  return results || 'No packages found';
}

async function searchPyPI(query: string, limit: number): Promise<string> {
  const response = await axios.get(
    `https://pypi.org/pypi/${query}/json`,
    {
      timeout: 10000
    }
  );

  const pkg = response.data;
  return `1. ${pkg.info.name} - ${pkg.info.summary || 'No description'} (📦${pkg.info.version})`;
}

async function searchStackOverflow(query: string, limit: number, stackoverflow_access_token?: string, stackoverflow_client_id?: string, stackoverflow_client_secret?: string): Promise<string> {
  const params: any = {
    order: 'desc',
    sort: 'activity',
    intitle: query,
    site: 'stackoverflow',
    pagesize: limit
  };

  // Handle OAuth credentials
  if (stackoverflow_access_token) {
    params.access_token = stackoverflow_access_token;
  } else if (stackoverflow_client_id && stackoverflow_client_secret) {
    // For client credentials flow, we'd need to get an access token first
    // For now, we'll use anonymous access but the credentials are available
    console.log('Stack Overflow client credentials available for OAuth flow');
  }

  const response = await axios.get(
    'https://api.stackexchange.com/2.3/search',
    {
      params,
      timeout: 10000
    }
  );

  const results = response.data.items.map((item: any, index: number) => 
    `${index + 1}. ${item.title} (👍${item.score})`
  ).join('\n');

  return results || 'No questions found';
}

async function searchMDN(query: string, limit: number): Promise<string> {
  // MDN uses web scraping, so we'll return a simple message
  return `Search MDN for "${query}" - Visit: https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)}`;
}

async function searchRustCrates(query: string, limit: number): Promise<string> {
  const response = await axios.get(
    'https://crates.io/api/v1/crates',
    {
      params: {
        q: query,
        per_page: limit
      },
      timeout: 10000
    }
  );

  const results = response.data.crates.map((crate: any, index: number) => 
    `${index + 1}. ${crate.name} - ${crate.description || 'No description'} (📦${crate.max_version})`
  ).join('\n');

  return results || 'No crates found';
}

async function searchGoPackages(query: string, limit: number): Promise<string> {
  const response = await axios.get(
    'https://api.godoc.org/search',
    {
      params: {
        q: query,
        limit: limit
      },
      timeout: 10000
    }
  );

  const results = response.data.results.map((pkg: any, index: number) => 
    `${index + 1}. ${pkg.path} - ${pkg.synopsis || 'No description'} (⭐${pkg.star_count})`
  ).join('\n');

  return results || 'No packages found';
}

async function searchDevDocs(query: string, limit: number): Promise<string> {
  return `Search DevDocs for "${query}" - Visit: https://devdocs.io/?q=${encodeURIComponent(query)}`;
}

async function searchAwesomeLists(query: string, limit: number, github_token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CODE-RESEARCH-MCP-Server'
  };

  if (github_token) {
    headers['Authorization'] = `Bearer ${github_token}`;
  }

  const response = await axios.get(
    'https://api.github.com/search/repositories',
    {
      headers,
      params: {
        q: `awesome-${query} stars:>100`,
        sort: 'stars',
        order: 'desc',
        per_page: limit,
        page: 1
      },
      timeout: 10000
    }
  );

  const results = response.data.items.map((repo: any, index: number) => 
    `${index + 1}. ${repo.full_name} - ${repo.description || 'No description'} (⭐${repo.stargazers_count})`
  ).join('\n');

  return results || 'No awesome lists found';
}

async function searchRedditProgramming(query: string, limit: number): Promise<string> {
  const response = await axios.get(
    'https://www.reddit.com/r/programming/search.json',
    {
      params: {
        q: query,
        sort: 'relevance',
        limit: limit,
        t: 'all',
        restrict_sr: 'on',
        include_over_18: 'off'
      },
      timeout: 10000
    }
  );

  const results = response.data.data.children.map((post: any, index: number) => 
    `${index + 1}. ${post.data.title} (👍${post.data.score})`
  ).join('\n');

  return results || 'No posts found';
}

async function searchYoutubeTutorials(query: string, limit: number, youtube_api_key?: string): Promise<string> {
  if (!youtube_api_key) {
    return 'YouTube API key required. Please provide youtube_api_key parameter.';
  }

  const response = await axios.get(
    'https://www.googleapis.com/youtube/v3/search',
    {
      params: {
        part: 'snippet',
        q: `${query} programming tutorial`,
        type: 'video',
        maxResults: limit,
        key: youtube_api_key,
        videoEmbeddable: 'true',
        relevanceLanguage: 'en'
      },
      timeout: 10000
    }
  );

  const results = response.data.items.map((video: any, index: number) => 
    `${index + 1}. ${video.snippet.title} - ${video.snippet.channelTitle}`
  ).join('\n');

  return results || 'No tutorials found';
}

async function searchTechBlogs(query: string, limit: number): Promise<string> {
  // Try Dev.to first
  try {
    const response = await axios.get(
      'https://dev.to/api/articles',
      {
        params: {
          tag: query,
          per_page: limit,
          page: 1
        },
        timeout: 10000
      }
    );

    const results = response.data.map((article: any, index: number) => 
      `${index + 1}. ${article.title} - ${article.user.name} (${article.platform || 'Dev.to'})`
    ).join('\n');

    return results || 'No articles found';
  } catch (error) {
    return `Search tech blogs for "${query}" - Visit: https://dev.to/t/${encodeURIComponent(query)}`;
  }
} 