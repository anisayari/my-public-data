import { config } from 'dotenv';
import path from 'path';
import { fetchBookmarks } from './fetch-bookmarks';

// Load environment variables from the root .env file
config({ path: path.join(__dirname, '..', '..', '.env') });

async function test() {
  try {
    console.log('Testing Twitter bookmarks fetch...');
    console.log('Using credentials:');
    console.log('API Key:', process.env.TWITTER_API_KEY?.slice(0, 5) + '...');
    console.log('Access Token:', process.env.TWITTER_ACCESS_TOKEN?.slice(0, 5) + '...');
    
    await fetchBookmarks();
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test(); 