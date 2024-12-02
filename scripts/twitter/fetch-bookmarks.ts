import { TwitterApi } from 'twitter-api-v2';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function backupPreviousData() {
  try {
    // Read the current metadata file
    const metadataPath = path.join(process.cwd(), '..', '..', 'twitter', 'metadata.json');
    const bookmarksPath = path.join(process.cwd(), '..', '..', 'twitter', 'bookmarks.json');
    
    // Check if files exist
    try {
      await fs.access(metadataPath);
      await fs.access(bookmarksPath);
    } catch {
      console.log('No previous data to backup');
      return;
    }

    // Read current metadata and bookmarks
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    const bookmarks = await fs.readFile(bookmarksPath, 'utf-8');

    // Create backup filename using the last_updated timestamp
    const lastUpdated = new Date(metadata.last_updated);
    const timestamp = lastUpdated.toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), '..', '..', 'twitter', 'backups');
    
    // Create backups directory if it doesn't exist
    await fs.mkdir(backupDir, { recursive: true });

    // Save backup
    const backupPath = path.join(backupDir, `bookmarks-${timestamp}.json`);
    await fs.writeFile(backupPath, bookmarks);
    console.log(`Backed up previous bookmarks to ${backupPath}`);
  } catch (error) {
    console.error('Error backing up previous data:', error);
  }
}

async function updateTokens(newRefreshToken: string, expiresIn: number) {
  try {
    // Update local .env file
    const envPath = path.join(__dirname, '../../.env');
    let envContent = await fs.readFile(envPath, 'utf-8');
    
    // Update refresh token
    envContent = envContent.replace(
      /TWITTER_REFRESH_TOKEN=.*/,
      `TWITTER_REFRESH_TOKEN=${newRefreshToken}`
    );
    
    // Update expiration time
    const expirationTime = new Date(Date.now() + expiresIn * 1000).toISOString();
    if (envContent.includes('TWITTER_TOKEN_EXPIRES_AT=')) {
      envContent = envContent.replace(
        /TWITTER_TOKEN_EXPIRES_AT=.*/,
        `TWITTER_TOKEN_EXPIRES_AT=${expirationTime}`
      );
    } else {
      envContent += `\nTWITTER_TOKEN_EXPIRES_AT=${expirationTime}`;
    }

    await fs.writeFile(envPath, envContent);
    console.log('✅ Updated local .env file with new refresh token');

    // Set for GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
      console.log('::set-env name=NEW_REFRESH_TOKEN::' + newRefreshToken);
    }
  } catch (error) {
    console.error('Error updating tokens:', error);
    throw error;
  }
}

async function getAccessToken() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const refreshToken = process.env.TWITTER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing required environment variables');
  }

  try {
    console.log('\n=== Getting Access Token ===');
    console.log('Using refresh token: ***************');
    
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

    // Save new refresh token if provided
    if (response.data.refresh_token) {
      await updateTokens(response.data.refresh_token, response.data.expires_in);
    }

    console.log('✅ Successfully got access token');
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token');
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data.error);
      console.error('Description:', error.response.data.error_description);
    }
    throw error;
  }
}

async function fetchBookmarks() {
  try {
    await backupPreviousData();
    const accessToken = await getAccessToken();
    
    console.log('\n=== Environment Info ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('Access Token: ***************');
    
    const client = new TwitterApi(accessToken);
    
    console.log('\n=== Fetching Bookmarks ===');
    console.log('Max results:', process.env.NODE_ENV === 'development' ? 5 : 50);
    console.log('Requesting bookmarks...');

    // Fetch bookmarks with user data and expanded URLs
    const bookmarksResponse = await client.v2.bookmarks({
      max_results: process.env.NODE_ENV === 'development' ? 5 : 50,
      expansions: ['author_id'],
      'tweet.fields': ['created_at', 'entities'],
      'user.fields': ['username', 'name'],
    }).catch(error => {
      console.error('\n=== API Error Details ===');
      if (error.data) {
        console.error('Error data:', JSON.stringify(error.data, null, 2));
      }
      if (error.headers) {
        console.error('Response headers:', error.headers);
      }
      if (error.code) {
        console.error('Error code:', error.code);
      }
      throw error;
    });

    console.log('\n=== Processing Response ===');
    const tweets = bookmarksResponse.tweets || [];
    const users = bookmarksResponse.includes?.users || [];

    console.log('Found tweets:', tweets.length);
    console.log('Found users:', users.length);

    const processedBookmarks = tweets.map((tweet) => {
      const author = users.find((user) => user.id === tweet.author_id);
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

    const data = {
      bookmarks: processedBookmarks,
      last_updated: new Date().toISOString(),
    };

    console.log('\n=== Saving Data ===');
    // Save to data file
    const dataPath = path.join(process.cwd(), '..', '..', 'twitter', 'bookmarks.json');
    console.log('Data path:', dataPath);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));

    // Update metadata
    const metadataPath = path.join(process.cwd(), '..', '..', 'twitter', 'metadata.json');
    console.log('Metadata path:', metadataPath);
    const metadata = {
      last_updated: new Date().toISOString(),
      bookmark_count: processedBookmarks.length,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log('\n=== Summary ===');
    console.log(`✅ Successfully saved ${processedBookmarks.length} bookmarks`);
    console.log('Last updated:', metadata.last_updated);
  } catch (error) {
    console.error('\n=== Error Details ===');
    if (error instanceof Error) {
      console.error('Error type:', error.name);
      console.error('Error message:', error.message.replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer ***'));
    }
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBookmarks().catch((error) => {
    console.error('Failed to fetch bookmarks:', error);
    process.exit(1);
  });
}

export { fetchBookmarks }; 