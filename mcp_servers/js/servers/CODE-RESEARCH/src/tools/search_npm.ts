// TODO: Implement npm search tool
// Will follow the same pattern as search_github.ts
// Uses npm registry API with proper error handling and caching

import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// npm API response interfaces
interface NpmPackage {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  maintainers: Array<{
    name: string;
    email?: string;
  }>;
  repository: {
    type: string;
    url: string;
  };
  homepage: string;
  bugs: {
    url: string;
  };
  license: string;
  readme: string;
  readmeFilename: string;
  time: {
    created: string;
    modified: string;
    [key: string]: string;
  };
  versions: {
    [key: string]: {
      name: string;
      version: string;
      description: string;
      main: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      license: string;
      repository: {
        type: string;
        url: string;
      };
      homepage: string;
      bugs: {
        url: string;
      };
      author: {
        name: string;
        email?: string;
        url?: string;
      };
      maintainers: Array<{
        name: string;
        email?: string;
      }>;
      time: string;
      dist: {
        integrity: string;
        shasum: string;
        tarball: string;
        fileCount: number;
        unpackedSize: number;
        'npm-signature': string;
      };
    };
  };
  dist: {
    integrity: string;
    shasum: string;
    tarball: string;
    fileCount: number;
    unpackedSize: number;
    'npm-signature': string;
  };
  _id: string;
  _rev: string;
  'dist-tags': {
    latest: string;
    [key: string]: string;
  };
  _npmUser: {
    name: string;
    email: string;
  };
  directories: {
    test: string;
    lib: string;
    bin: string;
    man: string;
    doc: string;
    example: string;
  };
  _npmVersion: string;
  _nodeVersion: string;
  _npmOperationalInternal: {
    host: string;
    tmp: string;
  };
  _hasShrinkwrap: boolean;
  deprecated?: string;
  engines: {
    node: string;
    npm?: string;
  };
  os: string[];
  cpu: string[];
  gitHead: string;
  _defaultsLoaded: boolean;
  _from: string;
  _integrity: string;
  _resolved: string;
  _shasum: string;
  _spec: string;
  _where: string;
}

interface NpmSearchResponse {
  objects: Array<{
    package: {
      name: string;
      scope: string;
      version: string;
      description: string;
      keywords: string[];
      date: string;
      links: {
        npm: string;
        homepage: string;
        repository: string;
        bugs: string;
      };
      author: {
        name: string;
        email?: string;
        url?: string;
      };
      publisher: {
        username: string;
        email: string;
      };
      maintainers: Array<{
        username: string;
        email: string;
      }>;
    };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
  time: string;
}

// npm search tool implementation
export function createNpmSearchTool(server: any) {
  server.tool(
    "search_npm",
    "Search npm packages using the npm registry API",
    {
      npm_token: z.string().optional().describe("NPM Registry Token (optional - for authenticated requests)"),
      query: z.string().describe("Search query for npm packages"),
      limit: z.number().min(1).max(100).optional().default(10).describe("Maximum number of results to return"),
      quality: z.number().min(0).max(1).optional().default(0.65).describe("Minimum quality score (0-1)"),
      popularity: z.number().min(0).max(1).optional().default(0.98).describe("Minimum popularity score (0-1)"),
      maintenance: z.number().min(0).max(1).optional().default(0.5).describe("Minimum maintenance score (0-1)"),
    },
    async ({ npm_token, query, limit, quality, popularity, maintenance }: {
      npm_token?: string;
      query: string;
      limit: number;
      quality: number;
      popularity: number;
      maintenance: number;
    }) => {
      try {
        // Create cache key
        const cacheKey = `npm:${query}:${limit}:${quality}:${popularity}:${maintenance}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `npm Search Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'CODE-RESEARCH-MCP-Server'
        };

        // Add npm token if provided
        if (npm_token) {
          headers['Authorization'] = `Bearer ${npm_token}`;
        }

        // Make API request to npm search
        const response = await axios.get<NpmSearchResponse>(
          'https://registry.npmjs.org/-/v1/search',
          {
            headers,
            params: {
              text: query,
              size: limit,
              quality: quality,
              popularity: popularity,
              maintenance: maintenance,
              from: 0
            },
            timeout: 10000
          }
        );

        // Format results
        const results = response.data.objects.map((obj, index) => {
          const pkg = obj.package;
          const score = obj.score;
          
          return {
            title: pkg.name,
            description: pkg.description || 'No description available',
            url: pkg.links.npm,
            metadata: {
              version: pkg.version,
              author: pkg.author?.name || 'Unknown',
              publisher: pkg.publisher.username,
              date: pkg.date,
              keywords: pkg.keywords || [],
              quality: Math.round(score.detail.quality * 100),
              popularity: Math.round(score.detail.popularity * 100),
              maintenance: Math.round(score.detail.maintenance * 100),
              finalScore: Math.round(score.final * 100),
              homepage: pkg.links.homepage,
              repository: pkg.links.repository
            }
          };
        });

        // Format output text
        const resultsText = results.length > 0
          ? results.map((result, index) => 
              `${index + 1}. **${result.title}** (v${result.metadata.version})\n` +
              `   Description: ${result.description}\n` +
              `   URL: ${result.url}\n` +
              `   Author: ${result.metadata.author} | Publisher: ${result.metadata.publisher}\n` +
              `   Quality: ${result.metadata.quality}% | Popularity: ${result.metadata.popularity}% | Maintenance: ${result.metadata.maintenance}%\n` +
              `   Score: ${result.metadata.finalScore}% | Published: ${new Date(result.metadata.date).toLocaleDateString()}\n` +
              `   Keywords: ${result.metadata.keywords.slice(0, 5).join(', ')}${result.metadata.keywords.length > 5 ? '...' : ''}\n`
            ).join('\n')
          : 'No packages found';

        const outputText = `npm Search Results for "${query}":\n\n${resultsText}\n\nTotal results: ${response.data.total}`;

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
        let errorMessage = 'An error occurred while searching npm';
        
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            errorMessage = 'npm API rate limit exceeded. Please try again later.';
          } else if (error.response?.status === 401) {
            errorMessage = 'npm API authentication failed. Please check your npm_token parameter.';
          } else if (error.response?.status) {
            errorMessage = `npm API error: ${error.response.status} - ${error.response.statusText}`;
          } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'npm API request timed out. Please try again.';
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