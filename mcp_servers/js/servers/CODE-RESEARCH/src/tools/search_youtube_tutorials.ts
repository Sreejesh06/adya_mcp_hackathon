import { z } from "zod";
import axios from "axios";
import NodeCache from "node-cache";

// Cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// YouTube API response interfaces
interface YouTubeVideo {
  id: {
    videoId: string;
    kind: string;
  };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      default: {
        url: string;
        width: number;
        height: number;
      };
      medium: {
        url: string;
        width: number;
        height: number;
      };
      high: {
        url: string;
        width: number;
        height: number;
      };
    };
    channelTitle: string;
    liveBroadcastContent: string;
    publishTime: string;
  };
}

interface YouTubeSearchResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  regionCode: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeVideo[];
}

interface YouTubeVideoDetails {
  items: Array<{
    id: string;
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
    contentDetails: {
      duration: string;
    };
  }>;
}

// YouTube Tutorials search tool implementation
export function createYoutubeTutorialsSearchTool(server: any) {
  server.tool(
    "search_youtube_tutorials",
    "Search YouTube for programming tutorials using YouTube Data API v3",
    {
      youtube_api_key: z.string().describe("YouTube Data API v3 Key"),
      query: z.string().describe("Search query for programming tutorials"),
      duration: z.enum(["short", "medium", "long"]).optional().describe("Filter by video duration"),
      upload_date: z.enum(["hour", "today", "week", "month", "year"]).optional().describe("Filter by upload date"),
      limit: z.number().min(1).max(10).optional().default(5).describe("Maximum number of results to return (1-10)"),
    },
    async ({ youtube_api_key, query, duration, upload_date, limit }: {
      youtube_api_key: string;
      query: string;
      duration?: string;
      upload_date?: string;
      limit: number;
    }) => {
      try {
        // Create cache key
        const cacheKey = `youtube:${query}:${duration || 'any'}:${upload_date || 'any'}:${limit}`;
        
        // Check cache first
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          return {
            content: [
              {
                type: "text",
                text: `YouTube Tutorials Search Results (cached):\n\n${cachedResult}`,
              },
            ],
          };
        }

        // Build search query with programming tutorial keywords
        const searchQuery = `${query} programming tutorial`;

        // Prepare headers
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'CODE-RESEARCH-MCP-Server'
        };

        // Build search parameters
        const searchParams: Record<string, string> = {
          part: 'snippet',
          q: searchQuery,
          type: 'video',
          maxResults: limit.toString(),
          key: youtube_api_key,
          videoEmbeddable: 'true',
          relevanceLanguage: 'en'
        };

        // Add duration filter
        if (duration) {
          let videoDuration = '';
          switch (duration) {
            case 'short':
              videoDuration = 'short'; // < 4 minutes
              break;
            case 'medium':
              videoDuration = 'medium'; // 4-20 minutes
              break;
            case 'long':
              videoDuration = 'long'; // > 20 minutes
              break;
          }
          if (videoDuration) {
            searchParams.videoDuration = videoDuration;
          }
        }

        // Add upload date filter
        if (upload_date) {
          let publishedAfter = '';
          const now = new Date();
          switch (upload_date) {
            case 'hour':
              publishedAfter = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
              break;
            case 'today':
              publishedAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
              break;
            case 'week':
              publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
              break;
            case 'month':
              publishedAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
              break;
            case 'year':
              publishedAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
              break;
          }
          if (publishedAfter) {
            searchParams.publishedAfter = publishedAfter;
          }
        }

        // Make API request to YouTube
        const response = await axios.get<YouTubeSearchResponse>(
          'https://www.googleapis.com/youtube/v3/search',
          {
            headers,
            params: searchParams,
            timeout: 15000
          }
        );

        // Get video details for view counts and durations
        const videoIds = response.data.items.map(item => item.id.videoId);
        const detailsResponse = await axios.get<YouTubeVideoDetails>(
          'https://www.googleapis.com/youtube/v3/videos',
          {
            headers,
            params: {
              part: 'statistics,contentDetails',
              id: videoIds.join(','),
              key: youtube_api_key
            },
            timeout: 15000
          }
        );

        // Create a map of video details
        const videoDetailsMap = new Map();
        detailsResponse.data.items.forEach(item => {
          videoDetailsMap.set(item.id, {
            viewCount: parseInt(item.statistics.viewCount),
            likeCount: parseInt(item.statistics.likeCount),
            commentCount: parseInt(item.statistics.commentCount),
            duration: item.contentDetails.duration
          });
        });

        // Format results
        const results = response.data.items.map(video => {
          const details = videoDetailsMap.get(video.id.videoId);
          
          // Convert ISO 8601 duration to readable format
          const durationStr = details?.duration ? parseDuration(details.duration) : 'Unknown';
          
          return {
            title: video.snippet.title,
            channel_title: video.snippet.channelTitle,
            description: video.snippet.description,
            published_at: video.snippet.publishedAt,
            view_count: details?.viewCount || 0,
            like_count: details?.likeCount || 0,
            comment_count: details?.commentCount || 0,
            duration: durationStr,
            thumbnail_url: video.snippet.thumbnails.high.url,
            video_url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
            channel_url: `https://www.youtube.com/channel/${video.snippet.channelId}`
          };
        });

        // Format output text
        const resultsText = results.length > 0
          ? results.map((result, index) => 
              `${index + 1}. **${result.title}**\n` +
              `   Channel: ${result.channel_title}\n` +
              `   Duration: ${result.duration} | Views: ${result.view_count.toLocaleString()}\n` +
              `   Likes: ${result.like_count.toLocaleString()} | Comments: ${result.comment_count.toLocaleString()}\n` +
              `   URL: ${result.video_url}\n` +
              `   Channel: ${result.channel_url}\n` +
              `   Published: ${new Date(result.published_at).toLocaleDateString()}\n` +
              `   Description: ${result.description.substring(0, 200)}${result.description.length > 200 ? '...' : ''}\n`
            ).join('\n')
          : 'No tutorials found';

        const outputText = `YouTube Tutorials Search Results for "${query}":\n\n${resultsText}\n\nTotal results: ${response.data.pageInfo.totalResults}`;

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
        let errorMessage = 'An error occurred while searching YouTube tutorials';
        
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 403) {
            errorMessage = 'YouTube API quota exceeded or invalid API key. Please check your youtube_api_key parameter.';
          } else if (error.response?.status === 400) {
            errorMessage = 'Invalid YouTube API request. Please check your parameters.';
          } else if (error.response?.status === 429) {
            errorMessage = 'YouTube API rate limit exceeded. Please try again later.';
          } else if (error.response?.status) {
            errorMessage = `YouTube API error: ${error.response.status} - ${error.response.statusText}`;
          } else if (error.code === 'ECONNABORTED') {
            errorMessage = 'YouTube API request timed out. Please try again.';
          } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Unable to reach YouTube API. Please check your internet connection.';
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

// Helper function to parse ISO 8601 duration
function parseDuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 'Unknown';
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
} 