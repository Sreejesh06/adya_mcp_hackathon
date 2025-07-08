// TODO: Implement Stack Overflow search tool
// Will follow the same pattern as search_github.ts
// Uses StackExchange API v2.3 with proper error handling and caching

import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Stack Exchange API response interfaces
interface StackOverflowQuestion {
  question_id: number;
  title: string;
  body: string;
  score: number;
  view_count: number;
  answer_count: number;
  accepted_answer_id?: number;
  creation_date: number;
  last_activity_date: number;
  owner: {
    user_id: number;
    display_name: string;
    reputation: number;
    profile_image: string;
    link: string;
  };
  tags: string[];
  link: string;
  is_answered: boolean;
  closed_date?: number;
  closed_reason?: string;
}

interface StackOverflowSearchResponse {
  items: StackOverflowQuestion[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
  total: number;
}

interface StackOverflowOAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// OAuth configuration - these are now for reference only
// In production, OAuth would be handled by the calling application
const STACK_OAUTH_CONFIG = {
  clientId: '',
  clientSecret: '',
  redirectUri: 'http://localhost:3000/oauth/callback',
  scope: 'read_inbox',
  authUrl: 'https://stackoverflow.com/oauth',
  tokenUrl: 'https://stackoverflow.com/oauth/access_token/json',
  apiUrl: 'https://api.stackexchange.com/2.3'
};

// OAuth token management
let oauthToken: string | null = null;
let tokenExpiry: number = 0;

// Helper function to get OAuth token
async function getOAuthToken(): Promise<string | null> {
  // Check if we have a valid token
  if (oauthToken && Date.now() < tokenExpiry) {
    return oauthToken;
  }

  // If no OAuth credentials, use anonymous access
  if (!STACK_OAUTH_CONFIG.clientId || !STACK_OAUTH_CONFIG.clientSecret) {
    console.log('No Stack Overflow OAuth credentials found. Using anonymous access.');
    return null;
  }

  try {
    // For server-side OAuth, we need to implement the full OAuth flow
    // This is a simplified version - in production you'd want a proper OAuth flow
    const response = await axios.post<StackOverflowOAuthResponse>(
      STACK_OAUTH_CONFIG.tokenUrl,
      {
        client_id: STACK_OAUTH_CONFIG.clientId,
        client_secret: STACK_OAUTH_CONFIG.clientSecret,
        grant_type: 'client_credentials',
        scope: STACK_OAUTH_CONFIG.scope
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );

    oauthToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    return oauthToken;
  } catch (error) {
    console.error('Failed to get OAuth token:', error);
    return null;
  }
}

// Stack Overflow search tool implementation
export function createStackOverflowSearchTool(server: any) {
  server.tool(
    "search_stackoverflow",
    "Search Stack Overflow for programming questions and answers using the StackExchange API",
    {
      stackoverflow_access_token: z.string().optional().describe("Stack Overflow Access Token (optional - for higher rate limits)"),
      stackoverflow_client_id: z.string().optional().describe("Stack Overflow OAuth Client ID (optional - for authenticated access)"),
      stackoverflow_client_secret: z.string().optional().describe("Stack Overflow OAuth Client Secret (optional - for authenticated access)"),
      query: z.string().describe("Search query for Stack Overflow questions"),
      limit: z.number().min(1).max(100).optional().default(10).describe("Maximum number of results to return"),
      sort: z.enum(["activity", "votes", "creation", "relevance"]).optional().default("relevance").describe("Sort order for results"),
      order: z.enum(["desc", "asc"]).optional().default("desc").describe("Sort direction"),
      tagged: z.string().optional().describe("Filter by tags (comma-separated)"),
      nottagged: z.string().optional().describe("Exclude tags (comma-separated)"),
      fromdate: z.number().optional().describe("Unix timestamp for start date"),
      todate: z.number().optional().describe("Unix timestamp for end date"),
      min: z.number().optional().describe("Minimum score for questions"),
      max: z.number().optional().describe("Maximum score for questions"),
      accepted: z.boolean().optional().describe("Only show questions with accepted answers"),
      answers: z.number().optional().describe("Minimum number of answers"),
      body: z.string().optional().describe("Search in question body"),
      title: z.string().optional().describe("Search in question title"),
      url: z.string().optional().describe("Search in question URL"),
      user: z.number().optional().describe("Filter by user ID"),
      views: z.number().optional().describe("Minimum number of views"),
      wiki: z.boolean().optional().describe("Only show community wiki questions"),
    },
    async ({ 
      stackoverflow_access_token,
      stackoverflow_client_id,
      stackoverflow_client_secret,
      query, 
      limit, 
      sort, 
      order, 
      tagged, 
      nottagged, 
      fromdate, 
      todate, 
      min, 
      max, 
      accepted, 
      answers, 
      body, 
      title, 
      url, 
      user, 
      views, 
      wiki 
    }: {
      stackoverflow_access_token?: string;
      stackoverflow_client_id?: string;
      stackoverflow_client_secret?: string;
      query: string;
      limit: number;
      sort: string;
      order: string;
      tagged?: string;
      nottagged?: string;
      fromdate?: number;
      todate?: number;
      min?: number;
      max?: number;
      accepted?: boolean;
      answers?: number;
      body?: string;
      title?: string;
      url?: string;
      user?: number;
      views?: number;
      wiki?: boolean;
    }) => {
      try {
        // Create cache key
        const cacheKey = `stackoverflow:${query}:${limit}:${sort}:${order}:${tagged || 'all'}:${nottagged || 'none'}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `Stack Overflow Search Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'CODE-RESEARCH-MCP-Server'
        };

        // Add OAuth token if provided
        if (stackoverflow_access_token) {
          headers['Authorization'] = `Bearer ${stackoverflow_access_token}`;
        }

        // Handle OAuth flow with client credentials if provided
        let authToken = stackoverflow_access_token;
        if (!authToken && stackoverflow_client_id && stackoverflow_client_secret) {
          try {
            // Use client credentials grant type for OAuth
            const tokenResponse = await axios.post(
              'https://stackoverflow.com/oauth/access_token/json',
              {
                client_id: stackoverflow_client_id,
                client_secret: stackoverflow_client_secret,
                grant_type: 'client_credentials',
                scope: 'read_inbox'
              },
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
              }
            );
            
            if (tokenResponse.data.access_token) {
              authToken = tokenResponse.data.access_token;
              headers['Authorization'] = `Bearer ${authToken}`;
            }
          } catch (oauthError) {
            console.warn('OAuth token request failed, falling back to anonymous access:', oauthError);
          }
        }

        // Build search parameters
        const params: Record<string, any> = {
          site: 'stackoverflow',
          pagesize: limit,
          sort: sort,
          order: order,
          intitle: title || query, // Use title parameter if provided, otherwise use query
          q: body ? query : undefined, // Use body parameter if provided
          tagged: tagged,
          nottagged: nottagged,
          fromdate: fromdate,
          todate: todate,
          min: min,
          max: max,
          accepted: accepted,
          answers: answers,
          url: url,
          user: user,
          views: views,
          wiki: wiki,
          filter: 'withbody' // Include question body for better context
        };

        // Remove undefined parameters
        Object.keys(params).forEach(key => {
          if (params[key] === undefined) {
            delete params[key];
          }
        });

        // Make API request
        const response = await axios.get<StackOverflowSearchResponse>(
          `${STACK_OAUTH_CONFIG.apiUrl}/search/advanced`,
          {
            headers,
            params,
            timeout: 15000
          }
        );

        // Check quota
        if (response.data.quota_remaining <= 0) {
          return {
            content: [
              {
                type: "text",
                text: `Stack Overflow API quota exceeded. Quota resets daily. Please try again later.\n\nQuota: ${response.data.quota_remaining}/${response.data.quota_max}`,
              },
            ],
          };
        }

        // Format results
        const results = response.data.items.map((question, index) => {
          // Clean up HTML from body (basic cleanup)
          const cleanBody = question.body
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&[^;]+;/g, ' ') // Replace HTML entities
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .substring(0, 200) + (question.body.length > 200 ? '...' : '');

          return {
            title: question.title,
            description: cleanBody,
            url: question.link,
            metadata: {
              questionId: question.question_id,
              score: question.score,
              views: question.view_count,
              answers: question.answer_count,
              accepted: question.is_answered,
              tags: question.tags,
              author: question.owner.display_name,
              authorReputation: question.owner.reputation,
              created: new Date(question.creation_date * 1000).toLocaleDateString(),
              lastActivity: new Date(question.last_activity_date * 1000).toLocaleDateString(),
              closed: question.closed_date ? new Date(question.closed_date * 1000).toLocaleDateString() : null,
              closedReason: question.closed_reason || null
            }
          };
        });

        // Format output text
        const resultsText = results.length > 0
          ? results.map((result, index) => 
              `${index + 1}. **${result.title}**\n` +
              `   Description: ${result.description}\n` +
              `   URL: ${result.url}\n` +
              `   Score: ${result.metadata.score} | Views: ${result.metadata.views} | Answers: ${result.metadata.answers} | Accepted: ${result.metadata.accepted ? 'Yes' : 'No'}\n` +
              `   Author: ${result.metadata.author} (${result.metadata.authorReputation} rep) | Tags: ${result.metadata.tags.join(', ')}\n` +
              `   Created: ${result.metadata.created} | Last Activity: ${result.metadata.lastActivity}\n` +
              `${result.metadata.closed ? `   Closed: ${result.metadata.closed}${result.metadata.closedReason ? ` (${result.metadata.closedReason})` : ''}\n` : ''}`
            ).join('\n')
          : 'No questions found';

        const outputText = `Stack Overflow Search Results for "${query}":\n\n${resultsText}\n\nTotal results: ${response.data.total} | Quota remaining: ${response.data.quota_remaining}/${response.data.quota_max}`;

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
        let errorMessage = 'An error occurred while searching Stack Overflow';
        
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            errorMessage = 'Stack Overflow API rate limit exceeded. Please try again later.';
          } else if (error.response?.status === 401) {
            errorMessage = 'Stack Overflow API authentication failed. Please check your OAuth credentials.';
          } else if (error.response?.status === 403) {
            errorMessage = 'Stack Overflow API access forbidden. Please check your OAuth permissions.';
          } else if (error.response?.status) {
            errorMessage = `Stack Overflow API error: ${error.response.status} - ${error.response.statusText}`;
          } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'Stack Overflow API request timed out. Please try again.';
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