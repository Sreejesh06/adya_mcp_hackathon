# 🔒 Security Guidelines for MCP Hackathon Project

## ⚠️ Important Security Notes

### 🚫 **NEVER COMMIT REAL API KEYS OR SECRETS**

This repository contains template files with placeholder values. **DO NOT** replace these placeholders with real credentials in files that will be committed to Git.

### 📋 **Files That Should Never Contain Real Secrets**

- `postman_api_collections/*.postman_environment.json` (use template versions only)
- `*.env` files (use local copies only)
- Any configuration files in the repository

### ✅ **Safe Practices**

1. **Use Local Environment Files**: Create local `.env` files that are gitignored
2. **Use Postman Variables**: Set up environment variables in Postman locally
3. **Use Template Files**: Keep template versions in the repo with `YOUR_*_HERE` placeholders
4. **Double-Check Before Committing**: Always review your changes before committing

### 🔑 **Required API Keys**

For testing the MCP servers, you'll need:

**CODE-RESEARCH Server:**
- **GitHub Personal Access Token**: For `search_github` and `search_awesome_lists` tools
- **NPM Token**: For `search_npm` tool
- **Stack Overflow Access Token**: For `search_stackoverflow` tool (optional)
- **YouTube API Key**: For `search_youtube_tutorials` tool
- **Gemini API Key**: For AI-powered function calling

**OMNISEARCH Server:**
- **Tavily API Key**: For search functionality
- **Brave API Key**: For Brave search
- **Kagi API Key**: For Kagi search
- **Perplexity API Key**: For AI responses
- **Jina API Key**: For content processing
- **Firecrawl API Key**: For web crawling

**PINTEREST Server:**
- **Pinterest Client ID**: For OAuth authentication
- **Pinterest Client Secret**: For OAuth authentication

**WAYBACK and WORDPRESS Servers:**
- No API keys required (use public APIs)

### 🛡️ **How to Set Up Credentials Safely**

1. **For Postman Testing**:
   - Import the collection and environment template
   - Edit the environment in Postman locally
   - Replace `YOUR_*_HERE` placeholders with real values
   - **Never export/commit the environment with real values**

2. **For Local Development**:
   - Create a local `.env` file (gitignored)
   - Add your credentials there
   - Use environment variables in your code

3. **For Production**:
   - Use environment variables or secure secret management
   - Never hardcode credentials in source code

### 🚨 **If You Accidentally Commit Secrets**

1. **Immediately rotate/revoke the exposed credentials**
2. **Remove the secrets from Git history**
3. **Use `git reset` or `git rebase` to clean history**
4. **Force push to update remote repository**

### 📞 **Contact**

If you accidentally commit secrets or need help with security setup, please reach out immediately so we can help secure the repository.
