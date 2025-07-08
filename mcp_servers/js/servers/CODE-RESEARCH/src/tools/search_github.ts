import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// GitHub API response interfaces
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
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
}

// GitHub search tool implementation
export function createGitHubSearchTool(server: any) {
  server.tool(
    "search_github",
    "Search GitHub repositories using the GitHub API",
    {
      github_token: z.string().optional().describe("GitHub Personal Access Token (optional - for higher rate limits)"),
      query: z.string().describe("Search query for GitHub repositories"),
      limit: z.number().min(1).max(100).optional().default(10).describe("Maximum number of results to return"),
      sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional().default("stars").describe("Sort order for results"),
      order: z.enum(["desc", "asc"]).optional().default("desc").describe("Sort direction"),
      language: z.string().optional().describe("Filter by programming language"),
    },
    async ({ github_token, query, limit, sort, order, language }: {
      github_token?: string;
      query: string;
      limit: number;
      sort: string;
      order: string;
      language?: string;
    }) => {
      try {
        // Create cache key
        const cacheKey = `github:${query}:${limit}:${sort}:${order}:${language || 'all'}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `GitHub Search Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Build search query
        let searchQuery = query;
        if (language) {
          searchQuery += ` language:${language}`;
        }

        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CODE-RESEARCH-MCP-Server'
        };

        // Add GitHub token if provided
        if (github_token) {
          headers['Authorization'] = `Bearer ${github_token}`;
        }

        // Make API request
        const response = await axios.get<GitHubSearchResponse>(
          'https://api.github.com/search/repositories',
          {
            headers,
            params: {
              q: searchQuery,
              sort,
              order,
              per_page: limit,
              page: 1
            },
            timeout: 10000
          }
        );

        // Format results
        const results = response.data.items.map(repo => ({
          title: repo.full_name,
          description: repo.description || 'No description available',
          url: repo.html_url,
          metadata: {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language || 'Unknown',
            updated: repo.updated_at,
            owner: repo.owner.login
          }
        }));

        // Format output text
        const resultsText = results.length > 0
          ? results.map((result, index) => 
              `${index + 1}. **${result.title}**\n` +
              `   Description: ${result.description}\n` +
              `   URL: ${result.url}\n` +
              `   Stars: ${result.metadata.stars} | Forks: ${result.metadata.forks} | Language: ${result.metadata.language}\n` +
              `   Owner: ${result.metadata.owner} | Updated: ${new Date(result.metadata.updated).toLocaleDateString()}\n`
            ).join('\n')
          : 'No repositories found';

        const outputText = `GitHub Search Results for "${query}":\n\n${resultsText}\n\nTotal results: ${response.data.total_count}`;

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
        let errorMessage = 'An error occurred while searching GitHub';
        
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