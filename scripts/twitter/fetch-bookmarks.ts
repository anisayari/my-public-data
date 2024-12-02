import { TwitterApi } from 'twitter-api-v2';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  entities?: {
    urls?: Array<{
      expanded_url: string;
    }>;
  };
}

interface User {
  id: string;
  username?: string;
  name?: string;
}

interface Bookmark {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_username?: string;
  author_name?: string;
  urls?: string[];
}

interface BookmarksData {
  bookmarks: Bookmark[];
  last_updated: string;
}

async function getOAuth2Token() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const refreshToken = process.env.TWITTER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing required environment variables');
  }

  try {
    console.log('Getting OAuth2 token...');
    console.log('Using refresh token:', refreshToken.slice(0, 10) + '...');

    const response = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
      }
    );

    console.log('Successfully got new access token');
    return response.data.access_token;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('Error response:', error.response.data);
      console.error('Status code:', error.response.status);
    }
    throw error;
  }
}

async function fetchBookmarks() {
  try {
    // Get OAuth 2.0 access token
    const accessToken = await getOAuth2Token();
    
    console.log('Fetching bookmarks...');
    
    // Create client with OAuth 2.0 User Context
    const client = new TwitterApi(accessToken);

    // Fetch bookmarks with user data and expanded URLs
    const bookmarksResponse = await client.v2.bookmarks({
      max_results: 50,
      expansions: ['author_id'],
      'tweet.fields': ['created_at', 'entities'],
      'user.fields': ['username', 'name'],
    });

    const tweets = bookmarksResponse.tweets || [];
    const users = bookmarksResponse.includes?.users || [];

    const processedBookmarks: Bookmark[] = tweets.map((tweet: Tweet) => {
      const author = users.find((user: User) => user.id === tweet.author_id);
      const urls = tweet.entities?.urls?.map((url) => url.expanded_url) || [];

      return {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at!,
        author_id: tweet.author_id!,
        author_username: author?.username,
        author_name: author?.name,
        urls: urls.length > 0 ? urls : undefined,
      };
    });

    const data: BookmarksData = {
      bookmarks: processedBookmarks,
      last_updated: new Date().toISOString(),
    };

    // Save to data file
    const dataPath = path.join(process.cwd(), '..', '..', 'twitter', 'bookmarks.json');
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));

    // Update metadata
    const metadataPath = path.join(process.cwd(), '..', '..', 'twitter', 'metadata.json');
    const metadata = {
      last_updated: new Date().toISOString(),
      bookmark_count: processedBookmarks.length,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`Successfully saved ${processedBookmarks.length} bookmarks`);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    throw error;
  }
}

// If running directly (not imported)
if (require.main === module) {
  fetchBookmarks().catch(console.error);
}

export { fetchBookmarks }; 