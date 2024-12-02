# Public Data Repository

This repository serves as a public data source for my personal website. Data is automatically updated through GitHub Actions.

## Structure

### Twitter
- `twitter/bookmarks.json`: Contains my latest 50 Twitter bookmarks, updated every 6 hours
- `twitter/metadata.json`: Contains metadata about the bookmarks collection

### YouTube
- `youtube/data.json`: Contains information about my YouTube videos, updated every 48 hours
- `youtube/metadata.json`: Contains channel statistics and metadata

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your credentials
3. Add the following secrets to your GitHub repository:
   - `TWITTER_CLIENT_ID`
   - `TWITTER_CLIENT_SECRET`
   - `TWITTER_REFRESH_TOKEN`
   - `YOUTUBE_API_KEY`

## Security
- Never commit `.env` files
- Always use GitHub Secrets for sensitive data
- The repository is public but credentials are protected

## Updates
- Twitter bookmarks are automatically fetched every 6 hours
- YouTube data is updated every 48 hours
- Both services can be manually triggered through GitHub Actions

## Local Development

### Twitter Setup