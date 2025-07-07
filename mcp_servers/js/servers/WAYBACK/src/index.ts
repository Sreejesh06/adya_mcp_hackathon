#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// ================ INTERFACES ================

interface WaybackSnapshot {
  url: string;
  timestamp: string;
  status: string;
  available: boolean;
}

interface WaybackSearchResult {
  url: string;
  timestamp: string;
  original: string;
  mimetype: string;
  statuscode: string;
  digest: string;
  length: string;
}

// ================ SERVER INIT ================
const server = new McpServer({
  name: "WAYBACK",
  version: "1.0.0",
  capabilities: {
    tools: {},
    resources: {},
  },
});

// ================ HELPER FUNCTIONS ================

// Helper function for making Wayback Machine API requests
async function makeWaybackRequest<T>({
  endpoint,
  params = {}
}: {
  endpoint: string;
  params?: Record<string, any>;
}): Promise<T> {
  try {
    const url = new URL(endpoint);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await axios({
      method: 'GET',
      url: url.toString(),
      timeout: 30000, // 30 second timeout
    });
    
    return response.data as T;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Wayback Machine API error: ${error.response.status} - ${error.response.statusText}`);
    }
    throw error;
  }
}

// Enhanced date parser for various formats
function parseFlexibleDate(dateStr: string, isEndDate: boolean = false): string {
  if (!dateStr) return '';
  
  // Remove extra spaces and normalize
  const cleanStr = dateStr.trim().toLowerCase();
  
  // Handle ranges like "2021-2025" or "2021 to 2025"
  const rangeMatch = cleanStr.match(/(\d{4})\s*(?:[-–—]|to)\s*(\d{4})/);
  if (rangeMatch) {
    const [, startYear, endYear] = rangeMatch;
    return isEndDate ? `${endYear}1231` : `${startYear}0101`;
  }
  
  // Handle single year like "2021"
  if (/^\d{4}$/.test(cleanStr)) {
    return isEndDate ? `${cleanStr}1231` : `${cleanStr}0101`;
  }
  
  // Handle already formatted YYYYMMDD or YYYYMMDDHHMMSS
  if (/^\d{8}(\d{6})?$/.test(cleanStr)) {
    return cleanStr.substring(0, 8);
  }
  
  // Handle ISO dates like "2021-01-01"
  const isoMatch = cleanStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
  }
  
  // Handle month names with various formats
  const monthNames = {
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
    'sep': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12'
  };
  
  // Handle formats like "Jan 1 2025", "January 1, 2025", "1 Jan 2025"
  const monthNameMatch = cleanStr.match(/(?:(\d{1,2})\s+)?(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthNameMatch) {
    const [, dayPrefix, monthName, day, year] = monthNameMatch;
    const actualDay = dayPrefix || day;
    const monthNum = monthNames[monthName as keyof typeof monthNames];
    return `${year}${monthNum}${actualDay.padStart(2, '0')}`;
  }
  
  // Handle formats like "Jan 2025", "January 2025"
  const monthYearMatch = cleanStr.match(/(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+(\d{4})/);
  if (monthYearMatch) {
    const [, monthName, year] = monthYearMatch;
    const monthNum = monthNames[monthName as keyof typeof monthNames];
    return isEndDate ? `${year}${monthNum}31` : `${year}${monthNum}01`;
  }
  
  // Handle formats like "2025 Jan", "2025 January"
  const yearMonthMatch = cleanStr.match(/(\d{4})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)/);
  if (yearMonthMatch) {
    const [, year, monthName] = yearMonthMatch;
    const monthNum = monthNames[monthName as keyof typeof monthNames];
    return isEndDate ? `${year}${monthNum}31` : `${year}${monthNum}01`;
  }
  
  // Handle MM/DD/YYYY or DD/MM/YYYY formats (assume MM/DD/YYYY for US format)
  const slashMatch = cleanStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    // Assume MM/DD/YYYY format
    const month = part1.padStart(2, '0');
    const day = part2.padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  // Handle relative terms
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
  const currentDay = now.getDate().toString().padStart(2, '0');
  
  if (cleanStr.includes('today') || cleanStr.includes('now')) {
    return `${currentYear}${currentMonth}${currentDay}`;
  }
  
  if (cleanStr.includes('yesterday')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}${(yesterday.getMonth() + 1).toString().padStart(2, '0')}${yesterday.getDate().toString().padStart(2, '0')}`;
  }
  
  if (cleanStr.includes('last year')) {
    const lastYear = currentYear - 1;
    return isEndDate ? `${lastYear}1231` : `${lastYear}0101`;
  }
  
  if (cleanStr.includes('this year')) {
    return isEndDate ? `${currentYear}1231` : `${currentYear}0101`;
  }
  
  // If nothing matches, try to parse as a regular date
  try {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      const month = (parsedDate.getMonth() + 1).toString().padStart(2, '0');
      const day = parsedDate.getDate().toString().padStart(2, '0');
      return `${year}${month}${day}`;
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  // Return empty string if no format matches
  return '';
}

console.log("✅ Wayback Machine MCP Server initialized");

// ================ WAYBACK MACHINE TOOLS ================

// Helper function to normalize URLs
function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

server.tool(
  "get-wayback-snapshots",
  "Fetches available snapshots from the Wayback Machine for a given URL",
  {
    url: z.string().describe("The URL to look up in the Wayback Machine (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const params: Record<string, any> = { url: normalizedUrl };
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) params.timestamp = parsedTimestamp;
      }

      const response = await makeWaybackRequest<{
        archived_snapshots: {
          closest?: WaybackSnapshot;
        };
      }>({
        endpoint: "https://archive.org/wayback/available",
        params,
      });

      const snapshots = response.archived_snapshots || {};
      
      if (!snapshots.closest) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const snapshot = snapshots.closest;
      const formattedDate = new Date(
        snapshot.timestamp.substr(0, 4) + '-' + 
        snapshot.timestamp.substr(4, 2) + '-' + 
        snapshot.timestamp.substr(6, 2) + 'T' +
        snapshot.timestamp.substr(8, 2) + ':' + 
        snapshot.timestamp.substr(10, 2) + ':' + 
        snapshot.timestamp.substr(12, 2) + 'Z'
      ).toISOString();        return {
          content: [{
            type: "text",
            text: `📸 Wayback Machine Snapshot Found:\n\n` +
              `🔗 Original URL: ${normalizedUrl}\n` +
              `📅 Snapshot Date: ${formattedDate}\n` +
              `🌐 Archived URL: ${snapshot.url}\n` +
              `📊 Status: ${snapshot.status}\n` +
              `✅ Available: ${snapshot.available ? 'Yes' : 'No'}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error fetching snapshots: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "search-wayback-history",
  "Search the complete history of snapshots for a URL in the Wayback Machine",
  {
    url: z.string().describe("The URL to search for in the Wayback Machine (with or without https://)"),
    from: z.string().optional().describe("Start date for search (flexible format: 'Jan 1 2025', '2021', '2021-2025', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'last year', etc.)"),
    to: z.string().optional().describe("End date for search (flexible format: 'Jan 1 2025', '2021', '2021-2025', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
    limit: z.number().min(1).max(1000).optional().default(100).describe("Maximum number of results to return"),
    filter: z.enum(["statuscode:200", "mimetype:text/html", "original"]).optional().describe("Filter results"),
  },
  async ({ url, from, to, limit, filter }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      // Use CDX API for comprehensive search
      const params: Record<string, any> = {
        url: normalizedUrl,
        output: "json",
        limit,
      };
      
      if (from) params.from = parseFlexibleDate(from);
      if (to) params.to = parseFlexibleDate(to, true);
      if (filter) params.filter = filter;

      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params,
      });

      if (!Array.isArray(response) || response.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No historical snapshots found for ${url}`
          }]
        };
      }

      // Skip the header row if present
      const snapshots = response.slice(1).slice(0, limit);
      
      if (snapshots.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url} in the specified criteria`
          }]
        };
      }

      const snapshotText = snapshots
        .map((snapshot: any, index: number) => {
          const timestamp = snapshot[1] || snapshot.timestamp;
          const originalUrl = snapshot[2] || snapshot.original;
          const statuscode = snapshot[4] || snapshot.statuscode;
          const formattedDate = timestamp ? new Date(
            timestamp.substr(0, 4) + '-' + 
            timestamp.substr(4, 2) + '-' + 
            timestamp.substr(6, 2) + 'T' +
            timestamp.substr(8, 2) + ':' + 
            timestamp.substr(10, 2) + ':' + 
            timestamp.substr(12, 2) + 'Z'
          ).toISOString() : 'Unknown';
          
          return `${index + 1}. 📅 ${formattedDate}\n` +
                 `   🔗 ${originalUrl}\n` +
                 `   📊 Status: ${statuscode}\n` +
                 `   🌐 Archive: https://web.archive.org/web/${timestamp}/${originalUrl}`;
        })
        .join("\n\n");        return {
          content: [{
            type: "text",
            text: `📚 Wayback Machine History for ${normalizedUrl}:\n\n` +
              `Found ${snapshots.length} snapshots:\n\n${snapshotText}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error searching Wayback history: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "save-page-now",
  "Saves the current version of a page to the Wayback Machine",
  {
    url: z.string().describe("The URL to archive (with or without https://)"),
    capture_all: z.boolean().optional().default(false).describe("Capture outlinks and embedded resources"),
  },
  async ({ url, capture_all }) => {
    const normalizedUrl = normalizeUrl(url);
    
    // Helper function to make a save request with retries
    async function makeSaveRequest(attempt: number = 1): Promise<any> {
      const maxAttempts = 3;
      const timeoutMs = Math.min(15000 + (attempt * 10000), 45000); // Progressive timeout: 15s, 25s, 35s
      
      try {
        const saveUrl = capture_all 
          ? `https://web.archive.org/save/${encodeURIComponent(normalizedUrl)}?capture_all=on`
          : `https://web.archive.org/save/${encodeURIComponent(normalizedUrl)}`;

        console.log(`Attempt ${attempt}/${maxAttempts}: Saving ${normalizedUrl} with timeout ${timeoutMs}ms`);

        const response = await axios.get(saveUrl, {
          timeout: timeoutMs,
          maxRedirects: 10,
          validateStatus: (status) => status < 600, // Accept all status codes under 600
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; MCP-Wayback/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        return response;
      } catch (error: any) {
        console.log(`Attempt ${attempt} failed:`, error.message);
        
        // Retry on timeout or connection errors (but not on 4xx errors)
        if (attempt < maxAttempts && 
            (error.code === 'ECONNABORTED' || 
             error.code === 'ETIMEDOUT' || 
             error.code === 'ECONNRESET' || 
             error.message.includes('timeout') ||
             error.message.includes('ENOTFOUND'))) {
          
          const delayMs = 2000 * attempt; // Progressive delay: 2s, 4s, 6s
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return makeSaveRequest(attempt + 1);
        }
        
        throw error;
      }
    }

    try {
      const response = await makeSaveRequest();

      // Check if we got redirected to an archived page
      const finalUrl = response.request.res?.responseUrl || response.config?.url || response.config.url;
      const isArchived = finalUrl && finalUrl.includes('/web/');

      // Handle different response statuses
      if (response.status === 523) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Wayback Machine is currently experiencing connectivity issues (Error 523)\n\n` +
              `🔄 Archive request for ${normalizedUrl} has been submitted\n` +
              `📋 The archive may still be processing. You can:\n` +
              `   1. Check status at: https://web.archive.org/web/*/${normalizedUrl}\n` +
              `   2. Try again in 5-10 minutes\n` +
              `   3. For large sites like GitHub, archiving can take longer\n\n` +
              `💡 Direct link: https://web.archive.org/save/${normalizedUrl}`
          }]
        };
      }

      if (response.status >= 500) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Wayback Machine server error (${response.status})\n\n` +
              `🔄 Archive request for ${normalizedUrl} submitted but server is busy\n` +
              `📋 For popular sites like GitHub, the archive may take 10-30 minutes\n` +
              `🔍 Check status: https://web.archive.org/web/*/${normalizedUrl}\n` +
              `💡 Manual submission: https://web.archive.org/save/${normalizedUrl}`
          }]
        };
      }

      if (isArchived) {
        // Extract timestamp from archived URL if possible
        const timestampMatch = finalUrl.match(/\/web\/(\d+)\//);
        const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        
        return {
          content: [{
            type: "text",
            text: `✅ Successfully archived ${normalizedUrl}!\n\n` +
              `📸 Archived URL: ${finalUrl}\n` +
              `🕒 Timestamp: ${timestamp}\n` +
              `📅 Readable date: ${new Date().toLocaleString()}\n` +
              `${capture_all ? '📦 Captured with outlinks and resources' : '📄 Basic capture'}\n\n` +
              `🔍 View all snapshots: https://web.archive.org/web/*/${normalizedUrl}`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `🔄 Archive request submitted for ${normalizedUrl}\n\n` +
              `⏱️ Processing time varies by site complexity:\n` +
              `   • Simple pages: 1-5 minutes\n` +
              `   • Complex sites (like GitHub): 10-30 minutes\n` +
              `   • Very large sites: Up to several hours\n\n` +
              `🔍 Check progress: https://web.archive.org/web/*/${normalizedUrl}\n` +
              `💡 Archive status will appear when ready`
          }]
        };
      }
    } catch (error: any) {
      // Provide more helpful error messages based on error type
      let errorMessage = `❌ Error saving page to Wayback Machine\n\n`;
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage += `⏱️ Request timed out after multiple attempts\n` +
          `📋 This often happens with large sites like GitHub\n` +
          `🔄 The archive request may still be processing in the background\n\n` +
          `✅ What you can do:\n` +
          `   1. Wait 15-30 minutes and check: https://web.archive.org/web/*/${normalizedUrl}\n` +
          `   2. Try a specific page instead of the main domain\n` +
          `   3. Submit manually: https://web.archive.org/save/${normalizedUrl}`;
      } else if (error.response?.status === 429) {
        errorMessage += `🚫 Rate limited by Wayback Machine\n` +
          `⏱️ Please wait a few minutes before trying again\n` +
          `💡 Manual submission: https://web.archive.org/save/${normalizedUrl}`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage += `🌐 Network connectivity issue\n` +
          `📋 Check your internet connection and try again\n` +
          `💡 Manual submission: https://web.archive.org/save/${normalizedUrl}`;
      } else {
        errorMessage += `📋 Error details: ${error.message}\n\n` +
          `💡 You can try manually at: https://web.archive.org/save/${normalizedUrl}`;
      }
      
      return {
        content: [{
          type: "text",
          text: errorMessage
        }]
      };
    }
  }
);

server.tool(
  "get-wayback-stats",
  "Get statistics about how many times a URL has been archived",
  {
    url: z.string().describe("The URL to get statistics for (with or without https://)"),
  },
  async ({ url }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      // Get count of all snapshots
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url: normalizedUrl,
          output: "json",
          showNumPages: "true",
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `📊 Wayback Machine Statistics for ${normalizedUrl}:\n\n` +
              `Total snapshots: 0\n` +
              `First archived: Never\n` +
              `Last archived: Never`
          }]
        };
      }

      // Skip header row and get actual data
      const snapshots = response.slice(1);
      const totalSnapshots = snapshots.length;
      
      if (totalSnapshots === 0) {
        return {
          content: [{
            type: "text",
            text: `📊 Wayback Machine Statistics for ${normalizedUrl}:\n\n` +
              `Total snapshots: 0\n` +
              `Status: Never archived`
          }]
        };
      }

      // Get first and last snapshot info
      const firstSnapshot = snapshots[0] as any;
      const lastSnapshot = snapshots[snapshots.length - 1] as any;
      
      const firstTimestamp = firstSnapshot[1] || firstSnapshot.timestamp;
      const lastTimestamp = lastSnapshot[1] || lastSnapshot.timestamp;
      
      const firstDate = firstTimestamp ? new Date(
        firstTimestamp.substr(0, 4) + '-' + 
        firstTimestamp.substr(4, 2) + '-' + 
        firstTimestamp.substr(6, 2) + 'T' +
        firstTimestamp.substr(8, 2) + ':' + 
        firstTimestamp.substr(10, 2) + ':' + 
        firstTimestamp.substr(12, 2) + 'Z'
      ).toISOString() : 'Unknown';
      
      const lastDate = lastTimestamp ? new Date(
        lastTimestamp.substr(0, 4) + '-' + 
        lastTimestamp.substr(4, 2) + '-' + 
        lastTimestamp.substr(6, 2) + 'T' +
        lastTimestamp.substr(8, 2) + ':' + 
        lastTimestamp.substr(10, 2) + ':' + 
        lastTimestamp.substr(12, 2) + 'Z'
      ).toISOString() : 'Unknown';        return {
          content: [{
            type: "text",
            text: `📊 Wayback Machine Statistics for ${normalizedUrl}:\n\n` +
              `📈 Total snapshots: ${totalSnapshots}\n` +
              `🕐 First archived: ${firstDate}\n` +
              `🕓 Last archived: ${lastDate}\n` +
              `📅 Archive span: ${Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))} days\n` +
              `🔗 Browse all: https://web.archive.org/web/*/${normalizedUrl}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting Wayback stats: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "compare-wayback-versions",
  "Compare two different archived versions of the same URL",
  {
    url: z.string().describe("The URL to compare versions for (with or without https://)"),
    timestamp1: z.string().describe("First timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
    timestamp2: z.string().describe("Second timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp1, timestamp2 }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      // Parse flexible timestamps
      const parsedTimestamp1 = parseFlexibleDate(timestamp1);
      const parsedTimestamp2 = parseFlexibleDate(timestamp2);
      
      if (!parsedTimestamp1 || !parsedTimestamp2) {
        return {
          content: [{
            type: "text",
            text: `❌ Could not parse timestamps. Please provide valid dates like 'Jan 1 2025', '2021', 'YYYYMMDD', etc.`
          }]
        };
      }
      
      // Get snapshots for both timestamps
      const snapshot1Response = await makeWaybackRequest<{
        archived_snapshots: { closest?: WaybackSnapshot };
      }>({
        endpoint: "https://archive.org/wayback/available",
        params: { url: normalizedUrl, timestamp: parsedTimestamp1 },
      });

      const snapshot2Response = await makeWaybackRequest<{
        archived_snapshots: { closest?: WaybackSnapshot };
      }>({
        endpoint: "https://archive.org/wayback/available",
        params: { url: normalizedUrl, timestamp: parsedTimestamp2 },
      });

      const snap1 = snapshot1Response.archived_snapshots?.closest;
      const snap2 = snapshot2Response.archived_snapshots?.closest;

      if (!snap1 || !snap2) {
        return {
          content: [{
            type: "text",
            text: `❌ Could not find snapshots for comparison:\n` +
              `Snapshot 1 (${timestamp1} → ${parsedTimestamp1}): ${snap1 ? 'Found' : 'Not found'}\n` +
              `Snapshot 2 (${timestamp2} → ${parsedTimestamp2}): ${snap2 ? 'Found' : 'Not found'}`
          }]
        };
      }

      const date1 = new Date(
        snap1.timestamp.substr(0, 4) + '-' + 
        snap1.timestamp.substr(4, 2) + '-' + 
        snap1.timestamp.substr(6, 2) + 'T' +
        snap1.timestamp.substr(8, 2) + ':' + 
        snap1.timestamp.substr(10, 2) + ':' + 
        snap1.timestamp.substr(12, 2) + 'Z'
      ).toISOString();

      const date2 = new Date(
        snap2.timestamp.substr(0, 4) + '-' + 
        snap2.timestamp.substr(4, 2) + '-' + 
        snap2.timestamp.substr(6, 2) + 'T' +
        snap2.timestamp.substr(8, 2) + ':' + 
        snap2.timestamp.substr(10, 2) + ':' + 
        snap2.timestamp.substr(12, 2) + 'Z'
      ).toISOString();

      const daysDiff = Math.abs((new Date(date2).getTime() - new Date(date1).getTime()) / (1000 * 60 * 60 * 24));        return {
          content: [{
            type: "text",
            text: `🔍 Wayback Machine Version Comparison for ${normalizedUrl}:\n\n` +
              `📅 Version 1: ${date1}\n` +
              `🔗 URL: ${snap1.url}\n` +
              `📊 Status: ${snap1.status}\n\n` +
              `📅 Version 2: ${date2}\n` +
              `🔗 URL: ${snap2.url}\n` +
              `📊 Status: ${snap2.status}\n\n` +
              `⏱️ Time difference: ${Math.round(daysDiff)} days\n\n` +
              `🔗 Compare visually:\n` +
              `Version 1: ${snap1.url}\n` +
              `Version 2: ${snap2.url}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error comparing versions: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ CORE TOOLS (HIGH-IMPACT) ================

server.tool(
  "get_snapshots",
  "Fetch closest available snapshot for a URL (alias for get-wayback-snapshots)",
  {
    url: z.string().describe("The URL to look up (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    const normalizedUrl = normalizeUrl(url);
    // Reuse existing get-wayback-snapshots implementation
    const params: Record<string, any> = { url: normalizedUrl };
    if (timestamp) {
      const parsedTimestamp = parseFlexibleDate(timestamp);
      if (parsedTimestamp) params.timestamp = parsedTimestamp;
    }

    try {
      const response = await makeWaybackRequest<{
        archived_snapshots: { closest?: WaybackSnapshot };
      }>({
        endpoint: "https://archive.org/wayback/available",
        params,
      });

      const snapshots = response.archived_snapshots || {};
      if (!snapshots.closest) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${normalizedUrl}`
          }]
        };
      }

      const snapshot = snapshots.closest;
      return {
        content: [{
          type: "text",
          text: `📸 Closest Snapshot: ${snapshot.url}\n📅 Date: ${snapshot.timestamp}\n📊 Status: ${snapshot.status}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_latest_snapshot",
  "Get the most recent snapshot of a URL",
  {
    url: z.string().describe("The URL to get the latest snapshot for (with or without https://)"),
  },
  async ({ url }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url: normalizedUrl,
          output: "json",
          limit: 1,
          sort: "reverse"
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const latest = response[1] as any;
      const timestamp = latest[1];
      const originalUrl = latest[2];
      const statuscode = latest[4];        return {
          content: [{
            type: "text",
            text: `🕐 Latest Snapshot for ${normalizedUrl}:\n\n` +
              `📅 Date: ${timestamp}\n` +
              `🔗 Archive URL: https://web.archive.org/web/${timestamp}/${originalUrl}\n` +
              `📊 Status: ${statuscode}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting latest snapshot: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_archived_page",
  "Fetch and preview raw HTML of a snapshot",
  {
    url: z.string().describe("The URL to get archived content for (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      let archiveUrl: string;
      
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) {
          archiveUrl = `https://web.archive.org/web/${parsedTimestamp}/${normalizedUrl}`;
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Could not parse timestamp: ${timestamp}. Please provide a valid date format.`
            }]
          };
        }
      } else {
        // Get latest snapshot first
        const response = await makeWaybackRequest<{
          archived_snapshots: { closest?: WaybackSnapshot };
        }>({
          endpoint: "https://archive.org/wayback/available",
          params: { url: normalizedUrl },
        });

        if (!response.archived_snapshots?.closest) {
          return {
            content: [{
              type: "text",
              text: `No archived content found for ${normalizedUrl}`
            }]
          };
        }
        
        archiveUrl = response.archived_snapshots.closest.url;
      }

      const htmlResponse = await axios.get(archiveUrl, {
        timeout: 30000,
        maxContentLength: 1024 * 1024 // 1MB limit
      });

      const html = htmlResponse.data;
      const preview = html.length > 2000 ? html.substring(0, 2000) + '...' : html;
      
      return {
        content: [{
          type: "text",
          text: `📄 Archived HTML Content (${html.length} chars):\n\n${preview}\n\n🔗 Full content at: ${archiveUrl}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error fetching archived page: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ TIMELINE & DIFF TOOLS ================

server.tool(
  "list_snapshot_dates",
  "List all snapshot timestamps for a URL",
  {
    url: z.string().describe("The URL to list snapshots for (with or without https://)"),
    limit: z.number().min(1).max(1000).optional().default(100).describe("Maximum number of timestamps to return"),
  },
  async ({ url, limit }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url: normalizedUrl,
          output: "json",
          limit,
          collapse: "timestamp"
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshot dates found for ${url}`
          }]
        };
      }

      const timestamps = response.slice(1).map((item: any) => item[1]).slice(0, limit);
      
      return {
        content: [{
          type: "text",
          text: `📅 Snapshot Dates for ${url} (${timestamps.length} total):\n\n` +
            timestamps.map((ts: string, i: number) => `${i + 1}. ${ts}`).join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error listing snapshot dates: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_diff_summary",
  "Text difference summary between two archived versions",
  {
    url: z.string().describe("The URL to compare (with or without https://)"),
    timestamp1: z.string().describe("First timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
    timestamp2: z.string().describe("Second timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp1, timestamp2 }) => {
    try {
      const parsedTimestamp1 = parseFlexibleDate(timestamp1);
      const parsedTimestamp2 = parseFlexibleDate(timestamp2);
      
      if (!parsedTimestamp1 || !parsedTimestamp2) {
        return {
          content: [{
            type: "text",
            text: `❌ Could not parse timestamps. Please provide valid dates.`
          }]
        };
      }
      
      const url1 = `https://web.archive.org/web/${parsedTimestamp1}/${url}`;
      const url2 = `https://web.archive.org/web/${parsedTimestamp2}/${url}`;

      const [response1, response2] = await Promise.all([
        axios.get(url1, { timeout: 30000, maxContentLength: 512 * 1024 }),
        axios.get(url2, { timeout: 30000, maxContentLength: 512 * 1024 })
      ]);

      const content1 = response1.data;
      const content2 = response2.data;
      
      const sizeDiff = content2.length - content1.length;
      const sizeChange = sizeDiff > 0 ? `+${sizeDiff}` : `${sizeDiff}`;
      
      return {
        content: [{
          type: "text",
          text: `📊 Content Diff Summary for ${url}:\n\n` +
            `📅 Version 1 (${timestamp1}): ${content1.length} characters\n` +
            `📅 Version 2 (${timestamp2}): ${content2.length} characters\n` +
            `📈 Size Change: ${sizeChange} characters\n` +
            `📊 Change Percentage: ${((sizeDiff / content1.length) * 100).toFixed(2)}%`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting diff summary: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "compare_page_length",
  "Compare size/length (bytes) of two archived versions",
  {
    url: z.string().describe("The URL to compare (with or without https://)"),
    timestamp1: z.string().describe("First timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
    timestamp2: z.string().describe("Second timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp1, timestamp2 }) => {
    try {
      const parsedTimestamp1 = parseFlexibleDate(timestamp1);
      const parsedTimestamp2 = parseFlexibleDate(timestamp2);
      
      if (!parsedTimestamp1 || !parsedTimestamp2) {
        return {
          content: [{
            type: "text",
            text: `❌ Could not parse timestamps. Please provide valid dates.`
          }]
        };
      }
      
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          filter: `timestamp:${parsedTimestamp1}|${parsedTimestamp2}`
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for the specified timestamps`
          }]
        };
      }

      const snapshots = response.slice(1);
      const snap1 = snapshots.find((s: any) => s[1].startsWith(parsedTimestamp1.substring(0, 8)));
      const snap2 = snapshots.find((s: any) => s[1].startsWith(parsedTimestamp2.substring(0, 8)));
      
      if (!snap1 || !snap2) {
        return {
          content: [{
            type: "text",
            text: `Could not find snapshots for both timestamps`
          }]
        };
      }

      const size1 = parseInt((snap1 as any)[5]) || 0;
      const size2 = parseInt((snap2 as any)[5]) || 0;
      const sizeDiff = size2 - size1;
      
      return {
        content: [{
          type: "text",
          text: `📏 Page Size Comparison for ${url}:\n\n` +
            `📅 ${timestamp1}: ${size1} bytes\n` +
            `📅 ${timestamp2}: ${size2} bytes\n` +
            `📊 Difference: ${sizeDiff > 0 ? '+' : ''}${sizeDiff} bytes\n` +
            `📈 Change: ${size1 > 0 ? ((sizeDiff / size1) * 100).toFixed(2) : 'N/A'}%`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error comparing page lengths: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ METADATA & CHECKS ================

server.tool(
  "check_if_archived",
  "Return true/false if a page has ever been archived",
  {
    url: z.string().describe("The URL to check (with or without https://)"),
  },
  async ({ url }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const response = await makeWaybackRequest<{
        archived_snapshots: { closest?: WaybackSnapshot };
      }>({
        endpoint: "https://archive.org/wayback/available",
        params: { url: normalizedUrl },
      });

      const isArchived = !!response.archived_snapshots?.closest;        return {
          content: [{
            type: "text",
            text: `🔍 Archive Status for ${normalizedUrl}: ${isArchived ? '✅ ARCHIVED' : '❌ NOT ARCHIVED'}`
          }]
        };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error checking archive status: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_original_url_from_snapshot",
  "Extract original URL from a Wayback Machine link",
  {
    wayback_url: z.string().url().describe("The Wayback Machine URL to parse"),
  },
  async ({ wayback_url }) => {
    try {
      const waybackPattern = /https?:\/\/web\.archive\.org\/web\/(\d+)\/(.+)/;
      const match = wayback_url.match(waybackPattern);
      
      if (!match) {
        return {
          content: [{
            type: "text",
            text: `❌ Invalid Wayback Machine URL format`
          }]
        };
      }

      const timestamp = match[1];
      const originalUrl = match[2];
      
      return {
        content: [{
          type: "text",
          text: `📋 Extracted from Wayback URL:\n\n` +
            `🔗 Original URL: ${originalUrl}\n` +
            `📅 Timestamp: ${timestamp}\n` +
            `🕒 Date: ${new Date(
              timestamp.substr(0, 4) + '-' + 
              timestamp.substr(4, 2) + '-' + 
              timestamp.substr(6, 2) + 'T' +
              timestamp.substr(8, 2) + ':' + 
              timestamp.substr(10, 2) + ':' + 
              timestamp.substr(12, 2) + 'Z'
            ).toISOString()}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error parsing Wayback URL: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_wayback_metadata",
  "Return headers, content-type, size, etc. for snapshot",
  {
    url: z.string().describe("The URL to get metadata for (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const params: Record<string, any> = {
        url: normalizedUrl,
        output: "json",
        limit: 1,
      };
      
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) {
          params.from = parsedTimestamp;
          params.to = parsedTimestamp;
        }
      }
      
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params,
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No metadata found for ${url}`
          }]
        };
      }

      const snapshot = response[1] as any;
      const [urlkey, ts, original, mimetype, statuscode, digest, length] = snapshot;
      
      return {
        content: [{
          type: "text",
          text: `📊 Wayback Metadata for ${url}:\n\n` +
            `📅 Timestamp: ${ts}\n` +
            `🔗 Original URL: ${original}\n` +
            `📄 MIME Type: ${mimetype}\n` +
            `📊 Status Code: ${statuscode}\n` +
            `📏 Content Length: ${length} bytes\n` +
            `🔐 Digest: ${digest}\n` +
            `🗝️ URL Key: ${urlkey}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting metadata: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "check_robots_status",
  "Check if URL is disallowed from archiving via robots.txt",
  {
    url: z.string().describe("The URL to check robots.txt status for (with or without https://)"),
  },
  async ({ url }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const urlObj = new URL(normalizedUrl);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      const robotsResponse = await axios.get(robotsUrl, {
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });

      if (robotsResponse.status !== 200) {
        return {
          content: [{
            type: "text",
            text: `🤖 Robots.txt Status for ${url}:\n\n` +
              `❌ No robots.txt found (${robotsResponse.status})\n` +
              `✅ Likely archivable by default`
          }]
        };
      }

      const robotsContent = robotsResponse.data;
      const disallowPattern = /Disallow:\s*([^\n\r]+)/gi;
      const userAgentPattern = /User-agent:\s*([^\n\r]+)/gi;
      
      let disallows: string[] = [];
      let match;
      
      while ((match = disallowPattern.exec(robotsContent)) !== null) {
        disallows.push(match[1].trim());
      }

      const isDisallowed = disallows.some(pattern => {
        if (pattern === '/') return true;
        if (pattern === urlObj.pathname) return true;
        if (pattern.endsWith('*') && urlObj.pathname.startsWith(pattern.slice(0, -1))) return true;
        return false;
      });

      return {
        content: [{
          type: "text",
          text: `🤖 Robots.txt Analysis for ${url}:\n\n` +
            `📄 Robots.txt found: ✅\n` +
            `🚫 Disallow rules: ${disallows.length}\n` +
            `📊 Status: ${isDisallowed ? '❌ DISALLOWED' : '✅ ALLOWED'}\n` +
            `🔗 Robots.txt: ${robotsUrl}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error checking robots.txt: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ SERVER START ================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Check if this file is being run directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main().catch((error) => {
    console.error("❌ Server failed to start:", error);
    process.exit(1);
  });
}

// ================ UTILITY & BULK TOOLS ================

server.tool(
  "archive_multiple_urls",
  "Archive an array of URLs in one request",
  {
    urls: z.array(z.string()).max(10).describe("Array of URLs to archive (max 10, with or without https://)"),
    capture_all: z.boolean().optional().default(false).describe("Capture embedded resources"),
  },
  async ({ urls, capture_all }) => {
    try {
      const results = [];
      
      for (const url of urls) {
        try {
          const saveUrl = capture_all 
            ? `https://web.archive.org/save/${encodeURIComponent(url)}?capture_all=on`
            : `https://web.archive.org/save/${encodeURIComponent(url)}`;

          await axios.get(saveUrl, { timeout: 30000, maxRedirects: 3 });
          results.push(`✅ ${url}: Archive requested`);
          
          // Add delay between requests to be respectful
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          results.push(`❌ ${url}: ${error instanceof Error ? error.message : 'Failed'}`);
        }
      }
      
      return {
        content: [{
          type: "text",
          text: `📦 Bulk Archive Results (${urls.length} URLs):\n\n${results.join('\n')}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error in bulk archive: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_archived_titles",
  "Extract <title> of each snapshot for quick glance",
  {
    url: z.string().describe("The URL to get titles for (with or without https://)"),
    limit: z.number().min(1).max(50).optional().default(10).describe("Number of snapshots to check"),
  },
  async ({ url, limit }) => {
    try {
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          limit,
          collapse: "timestamp"
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const titles = [];
      const snapshots = response.slice(1).slice(0, limit);
      
      for (const snapshot of snapshots) {
        try {
          const timestamp = (snapshot as any)[1];
          const archiveUrl = `https://web.archive.org/web/${timestamp}/${url}`;
          
          const htmlResponse = await axios.get(archiveUrl, {
            timeout: 10000,
            maxContentLength: 100 * 1024 // 100KB limit for title extraction
          });
          
          const titleMatch = htmlResponse.data.match(/<title[^>]*>([^<]*)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : 'No title found';
          
          titles.push(`📅 ${timestamp}: "${title}"`);
        } catch (error) {
          titles.push(`📅 ${(snapshot as any)[1]}: Error extracting title`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      return {
        content: [{
          type: "text",
          text: `📝 Page Titles Over Time for ${url}:\n\n${titles.join('\n')}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting archived titles: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "extract_text_from_snapshot",
  "Extract only visible <body> text for readability",
  {
    url: z.string().describe("The URL to extract text from (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    try {
      let archiveUrl: string;
      
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) {
          archiveUrl = `https://web.archive.org/web/${parsedTimestamp}/${url}`;
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Could not parse timestamp: ${timestamp}. Please provide a valid date format.`
            }]
          };
        }
      } else {
        const response = await makeWaybackRequest<{
          archived_snapshots: { closest?: WaybackSnapshot };
        }>({
          endpoint: "https://archive.org/wayback/available",
          params: { url },
        });

        if (!response.archived_snapshots?.closest) {
          return {
            content: [{
              type: "text",
              text: `No archived content found for ${url}`
            }]
          };
        }
        
        archiveUrl = response.archived_snapshots.closest.url;
      }

      const htmlResponse = await axios.get(archiveUrl, {
        timeout: 30000,
        maxContentLength: 1024 * 1024 // 1MB limit
      });

      const html = htmlResponse.data;
      
      // Simple text extraction - remove HTML tags and clean up
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      const preview = textContent.length > 3000 ? textContent.substring(0, 3000) + '...' : textContent;
      
      return {
        content: [{
          type: "text",
          text: `📄 Extracted Text from ${url} (${textContent.length} chars):\n\n${preview}\n\n🔗 Source: ${archiveUrl}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error extracting text: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_status_codes_over_time",
  "Track how HTTP status codes changed over time for the URL",
  {
    url: z.string().describe("The URL to track status codes for (with or without https://)"),
    limit: z.number().min(1).max(100).optional().default(50).describe("Number of snapshots to analyze"),
  },
  async ({ url, limit }) => {
    try {
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          limit,
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const statusCodes: { [key: string]: number } = {};
      const timeline: string[] = [];
      
      const snapshots = response.slice(1).slice(0, limit);
      
      snapshots.forEach((snapshot: any) => {
        const timestamp = snapshot[1];
        const statusCode = snapshot[4];
        
        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
        timeline.push(`📅 ${timestamp}: ${statusCode}`);
      });
      
      const statusSummary = Object.entries(statusCodes)
        .sort(([,a], [,b]) => b - a)
        .map(([code, count]) => `${code}: ${count} times`)
        .join(', ');
      
      return {
        content: [{
          type: "text",
          text: `📊 Status Code History for ${url}:\n\n` +
            `📈 Summary: ${statusSummary}\n\n` +
            `📅 Timeline (last ${Math.min(20, timeline.length)} entries):\n` +
            timeline.slice(-20).join('\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error tracking status codes: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ RESEARCH-FOCUSED TOOLS ================

server.tool(
  "search_keyword_in_snapshots",
  "Find snapshots that contain a given keyword (HTML/text search)",
  {
    url: z.string().describe("The URL to search in (with or without https://)"),
    keyword: z.string().describe("The keyword to search for"),
    limit: z.number().min(1).max(20).optional().default(10).describe("Max snapshots to check"),
  },
  async ({ url, keyword, limit }) => {
    try {
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          limit: limit * 2, // Get more to account for failed requests
          collapse: "timestamp"
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const matches: string[] = [];
      const snapshots = response.slice(1).slice(0, limit);
      
      for (const snapshot of snapshots) {
        try {
          const timestamp = (snapshot as any)[1];
          const archiveUrl = `https://web.archive.org/web/${timestamp}/${url}`;
          
          const htmlResponse = await axios.get(archiveUrl, {
            timeout: 15000,
            maxContentLength: 500 * 1024 // 500KB limit
          });
          
          const content = htmlResponse.data.toLowerCase();
          const keywordLower = keyword.toLowerCase();
          
          if (content.includes(keywordLower)) {
            // Find context around the keyword
            const index = content.indexOf(keywordLower);
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + keyword.length + 50);
            const context = content.substring(start, end).replace(/\s+/g, ' ').trim();
            
            matches.push(`📅 ${timestamp}: ...${context}...`);
          }
        } catch (error) {
          // Skip failed requests silently
          continue;
        }
        
        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return {
        content: [{
          type: "text",
          text: `🔍 Keyword "${keyword}" found in ${matches.length} snapshots of ${url}:\n\n` +
            (matches.length > 0 ? matches.join('\n\n') : 'No matches found in checked snapshots')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error searching for keyword: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "visualize_snapshot_frequency",
  "Return chart-friendly data (timestamp vs count)",
  {
    url: z.string().describe("The URL to analyze frequency for (with or without https://)"),
    granularity: z.enum(["year", "month", "day"]).optional().default("month").describe("Time granularity"),
  },
  async ({ url, granularity }) => {
    try {
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          limit: 1000,
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${url}`
          }]
        };
      }

      const frequency: { [key: string]: number } = {};
      const snapshots = response.slice(1);
      
      snapshots.forEach((snapshot: any) => {
        const timestamp = snapshot[1];
        let period: string;
        
        switch (granularity) {
          case "year":
            period = timestamp.substring(0, 4);
            break;
          case "month":
            period = timestamp.substring(0, 6);
            break;
          case "day":
            period = timestamp.substring(0, 8);
            break;
          default:
            period = timestamp.substring(0, 6);
        }
        
        frequency[period] = (frequency[period] || 0) + 1;
      });
      
      const chartData = Object.entries(frequency)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, count]) => `${period}: ${count}`)
        .join('\n');
      
      return {
        content: [{
          type: "text",
          text: `📊 Snapshot Frequency for ${url} (by ${granularity}):\n\n` +
            `Total periods: ${Object.keys(frequency).length}\n` +
            `Total snapshots: ${snapshots.length}\n\n` +
            `Chart Data:\n${chartData}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error analyzing frequency: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_first_archived_snapshot",
  "Return only the very first archived version",
  {
    url: z.string().describe("The URL to get the first snapshot for (with or without https://)"),
  },
  async ({ url }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url: normalizedUrl,
          output: "json",
          limit: 1,
          sort: "timestamp"
        },
      });

      if (!Array.isArray(response) || response.length <= 1) {
        return {
          content: [{
            type: "text",
            text: `No snapshots found for ${normalizedUrl}`
          }]
        };
      }

      const first = response[1] as any;
      const timestamp = first[1];
      const originalUrl = first[2];
      const statuscode = first[4];
      
      const formattedDate = new Date(
        timestamp.substr(0, 4) + '-' + 
        timestamp.substr(4, 2) + '-' + 
        timestamp.substr(6, 2) + 'T' +
        timestamp.substr(8, 2) + ':' + 
        timestamp.substr(10, 2) + ':' + 
        timestamp.substr(12, 2) + 'Z'
      ).toISOString();
      
      return {
        content: [{
          type: "text",
          text: `🏆 First Archived Snapshot for ${url}:\n\n` +
            `📅 Date: ${formattedDate}\n` +
            `🕰️ Timestamp: ${timestamp}\n` +
            `🔗 Archive URL: https://web.archive.org/web/${timestamp}/${originalUrl}\n` +
            `📊 Status: ${statuscode}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error getting first snapshot: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_most_changed_snapshots",
  "Show which snapshots differ the most in size or structure",
  {
    url: z.string().describe("The URL to analyze changes for (with or without https://)"),
    limit: z.number().min(1).max(50).optional().default(20).describe("Number of snapshots to analyze"),
  },
  async ({ url, limit }) => {
    try {
      const response = await makeWaybackRequest<WaybackSearchResult[]>({
        endpoint: "https://web.archive.org/cdx/search/cdx",
        params: {
          url,
          output: "json",
          limit,
        },
      });

      if (!Array.isArray(response) || response.length <= 2) {
        return {
          content: [{
            type: "text",
            text: `Not enough snapshots found for change analysis`
          }]
        };
      }

      const snapshots = response.slice(1);
      const changes: Array<{ timestamp: string; sizeDiff: number; prevSize: number; currentSize: number }> = [];
      
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1] as any;
        const current = snapshots[i] as any;
        
        const prevSize = parseInt(prev[5]) || 0;
        const currentSize = parseInt(current[5]) || 0;
        const sizeDiff = Math.abs(currentSize - prevSize);
        
        if (sizeDiff > 0) {
          changes.push({
            timestamp: current[1],
            sizeDiff,
            prevSize,
            currentSize
          });
        }
      }
      
      // Sort by size difference, largest first
      changes.sort((a, b) => b.sizeDiff - a.sizeDiff);
      
      const topChanges = changes.slice(0, 10);
      
      return {
        content: [{
          type: "text",
          text: `📊 Most Significant Changes for ${url}:\n\n` +
            topChanges.map((change, i) => 
              `${i + 1}. 📅 ${change.timestamp}\n` +
              `   📏 Size change: ${change.sizeDiff} bytes\n` +
              `   📊 ${change.prevSize} → ${change.currentSize} bytes\n` +
              `   📈 Change: ${((change.sizeDiff / Math.max(change.prevSize, 1)) * 100).toFixed(1)}%`
            ).join('\n\n')
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error analyzing changes: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// ================ AUTHENTICATION / CONTEXTUAL TOOLS ================

server.tool(
  "get_snapshot_redirect_chain",
  "Show original-to-final redirects stored in snapshot metadata",
  {
    url: z.string().describe("The URL to check redirects for (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
  },
  async ({ url, timestamp }) => {
    try {
      let archiveUrl: string;
      
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) {
          archiveUrl = `https://web.archive.org/web/${parsedTimestamp}/${url}`;
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Could not parse timestamp: ${timestamp}. Please provide a valid date format.`
            }]
          };
        }
      } else {
        const response = await makeWaybackRequest<{
          archived_snapshots: { closest?: WaybackSnapshot };
        }>({
          endpoint: "https://archive.org/wayback/available",
          params: { url },
        });

        if (!response.archived_snapshots?.closest) {
          return {
            content: [{
              type: "text",
              text: `No archived content found for ${url}`
            }]
          };
        }
        
        archiveUrl = response.archived_snapshots.closest.url;
      }

      const redirectResponse = await axios.get(archiveUrl, {
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: () => true // Accept all status codes
      });

      const redirects = [];
      let currentResponse = redirectResponse;
      
      // Check if there were redirects
      if (currentResponse.status >= 300 && currentResponse.status < 400) {
        redirects.push(`${currentResponse.status}: ${url} → ${currentResponse.headers.location}`);
      }
      
      return {
        content: [{
          type: "text",
          text: `🔄 Redirect Chain Analysis for ${url}:\n\n` +
            (redirects.length > 0 
              ? `Found ${redirects.length} redirects:\n${redirects.join('\n')}`
              : `No redirects found - direct response (${currentResponse.status})`
            ) +
            `\n\n🔗 Analyzed: ${archiveUrl}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error checking redirects: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "get_archived_links_from_page",
  "Extract all hyperlinks from an archived page",
  {
    url: z.string().describe("The URL to extract links from (with or without https://)"),
    timestamp: z.string().optional().describe("Specific timestamp (flexible format: 'Jan 1 2025', '2021', 'YYYYMMDD', 'YYYY-MM-DD', 'MM/DD/YYYY', 'January 2025', 'today', etc.)"),
    limit: z.number().min(1).max(100).optional().default(50).describe("Max links to return"),
  },
  async ({ url, timestamp, limit }) => {
    try {
      let archiveUrl: string;
      
      if (timestamp) {
        const parsedTimestamp = parseFlexibleDate(timestamp);
        if (parsedTimestamp) {
          archiveUrl = `https://web.archive.org/web/${parsedTimestamp}/${url}`;
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Could not parse timestamp: ${timestamp}. Please provide a valid date format.`
            }]
          };
        }
      } else {
        const response = await makeWaybackRequest<{
          archived_snapshots: { closest?: WaybackSnapshot };
        }>({
          endpoint: "https://archive.org/wayback/available",
          params: { url },
        });

        if (!response.archived_snapshots?.closest) {
          return {
            content: [{
              type: "text",
              text: `No archived content found for ${url}`
            }]
          };
        }
        
        archiveUrl = response.archived_snapshots.closest.url;
      }

      const htmlResponse = await axios.get(archiveUrl, {
        timeout: 30000,
        maxContentLength: 1024 * 1024 // 1MB limit
      });

      const html = htmlResponse.data;
      const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
      const links = [];
      let match;
      
      while ((match = linkPattern.exec(html)) !== null && links.length < limit) {
        const href = match[1];
        const text = match[2].trim();
        
        // Clean up Wayback Machine URLs
        const cleanHref = href.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\//, '');
        
        if (cleanHref && !cleanHref.startsWith('javascript:') && !cleanHref.startsWith('#')) {
          links.push(`🔗 ${text || 'No text'}: ${cleanHref}`);
        }
      }
      
      return {
        content: [{
          type: "text",
          text: `🔗 Links extracted from ${url} (${links.length} found):\n\n` +
            (links.length > 0 ? links.join('\n') : 'No links found') +
            `\n\n📄 Source: ${archiveUrl}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Error extracting links: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

server.tool(
  "check_link_rot_status",
  "Check if original URL still exists (for broken-link detection)",
  {
    url: z.string().describe("The URL to check current status for (with or without https://)"),
  },
  async ({ url }) => {
    const normalizedUrl = normalizeUrl(url);
    try {
      const startTime = Date.now();
      
      const response = await axios.get(normalizedUrl, {
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true // Accept all status codes
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      const isWorking = response.status >= 200 && response.status < 400;
      const status = isWorking ? '✅ WORKING' : '❌ BROKEN';        return {
          content: [{
            type: "text",
            text: `🔍 Link Status Check for ${normalizedUrl}:\n\n` +
              `📊 Status: ${status}\n` +
              `🌐 HTTP Code: ${response.status}\n` +
              `⏱️ Response Time: ${responseTime}ms\n` +
              `📏 Content Length: ${response.headers['content-length'] || 'Unknown'}\n` +
              `📄 Content Type: ${response.headers['content-type'] || 'Unknown'}\n` +
              `🕒 Checked: ${new Date().toISOString()}`
          }]
        };
    } catch (error) {        return {
          content: [{
            type: "text",
            text: `🔍 Link Status Check for ${normalizedUrl}:\n\n` +
              `📊 Status: ❌ BROKEN\n` +
              `❌ Error: ${error instanceof Error ? error.message : String(error)}\n` +
              `🕒 Checked: ${new Date().toISOString()}`
          }]
        };
    }
  }
);
