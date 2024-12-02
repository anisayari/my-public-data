import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function refreshToken() {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const refreshToken = process.env.TWITTER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing required environment variables');
  }

  try {
    console.log('Refreshing token...');
    
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

    const newRefreshToken = response.data.refresh_token;
    
    // Set the new refresh token as an environment variable for the GitHub Action
    console.log('::set-env name=NEW_REFRESH_TOKEN::' + newRefreshToken);
    
    console.log('Successfully refreshed token');
    return newRefreshToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshToken().catch(console.error);
}

export { refreshToken }; 