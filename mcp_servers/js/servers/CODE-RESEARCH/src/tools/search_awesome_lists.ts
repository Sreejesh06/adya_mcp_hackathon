import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// GitHub API response interfaces (reusing from search_github.ts)
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  topics: string[];
  homepage: string | null;
  license: {
    name: string;
  } | null;
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}

// Awesome Lists search tool implementation
export function createAwesomeListsSearchTool(server: any) {
  server.tool(
    "search_awesome_lists",
    "Search GitHub for awesome lists repositories",
    {
      github_token: z.string().optional().describe("GitHub Personal Access Token (optional - for higher rate limits)"),
      query: z.string().describe("Search query for awesome lists"),
      category: z.string().optional().describe("Filter by specific awesome category (e.g., javascript, python, react)"),
      limit: z.number().min(1).max(10).optional().default(5).describe("Maximum number of results to return (1-10)"),
    },
    async ({ github_token, query, category, limit }: {
      github_token?: string;
      query: string;
      category?: string;
      limit: number;
    }) => {
      try {
        // Create cache key
        const cacheKey = `awesome_lists:${query}:${category || 'all'}:${limit}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `Awesome Lists Search Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Build search query for awesome lists
        let searchQuery = `awesome-${query}`;
        if (category) {
          searchQuery += ` awesome-${category}`;
        }
        searchQuery += ' stars:>100'; // Filter for popular lists

        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CODE-RESEARCH-MCP-Server'
        };

        // Add GitHub token if provided
        if (github_token) {
          headers['Authorization'] = `Bearer ${github_token}`;
        }

        // Make API request to GitHub
        const response = await axios.get<GitHubSearchResponse>(
          'https://api.github.com/search/repositories',
          {
            headers,
            params: {
              q: searchQuery,
              sort: 'stars',
              order: 'desc',
              per_page: limit,
              page: 1
            },
            timeout: 10000
          }
        );

        // Format results
        const results = response.data.items.map(repo => {
          // Extract items count from README if possible (this is an approximation)
          const itemsCount = repo.description?.match(/(\d+)\+?\s*(items|resources|tools|libraries)/i)?.[1] || 'Unknown';
          
          return {
            title: repo.full_name,
            description: repo.description || 'No description available',
            url: repo.html_url,
            metadata: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              language: repo.language || 'Markdown',
              updated: repo.updated_at,
              owner: repo.owner.login,
              topics: repo.topics,
              homepage: repo.homepage,
              license: repo.license?.name,
              items_count: itemsCount
            }
          };
        });

        // Format output text
        const resultsText = results.length > 0
          ? results.map((result, index) => 
              `${index + 1}. **${result.title}**\n` +
              `   Description: ${result.description}\n` +
              `   URL: ${result.url}\n` +
              `   Stars: ${result.metadata.stars.toLocaleString()} | Forks: ${result.metadata.forks.toLocaleString()}\n` +
              `   Language: ${result.metadata.language} | Items: ${result.metadata.items_count}\n` +
              `   Owner: ${result.metadata.owner} | Updated: ${new Date(result.metadata.updated).toLocaleDateString()}\n` +
              `${result.metadata.homepage ? `   Homepage: ${result.metadata.homepage}\n` : ''}` +
              `${result.metadata.license ? `   License: ${result.metadata.license}\n` : ''}` +
              `${result.metadata.topics.length > 0 ? `   Topics: ${result.metadata.topics.join(', ')}\n` : ''}`
            ).join('\n')
          : 'No awesome lists found';

        const outputText = `Awesome Lists Search Results for "${query}":\n\n${resultsText}\n\nTotal results: ${response.data.total_count}`;

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
        let errorMessage = 'An error occurred while searching awesome lists';
        
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 403) {
            errorMessage = 'GitHub API rate limit exceeded. Please try again later or add a GitHub token to increase limits.';
          } else if (error.response?.status === 401) {
            errorMessage = 'GitHub API authentication failed. Please check your GITHUB_TOKEN.';
          } else if (error.response?.status) {
            errorMessage = `GitHub API error: ${error.response.status} - ${error.response.statusText}`;
          } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'GitHub API request timed out. Please try again.';
          } else {
            errorMessage = `Network error: ${error.message}`;
          }
        } else if (error instanceof Error) {
          errorMessage = `Error: ${error.message}`;
        }

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