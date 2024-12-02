import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testRefreshWorkflow() {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    const refreshToken = process.env.TWITTER_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.error('\n=== Missing Environment Variables ===');
      console.error('TWITTER_CLIENT_ID:', !!clientId);
      console.error('TWITTER_CLIENT_SECRET:', !!clientSecret);
      console.error('TWITTER_REFRESH_TOKEN:', !!refreshToken);
      throw new Error('Missing required environment variables');
    }

    console.log('\n=== Current Token Info ===');
    console.log('Current refresh token:', refreshToken.slice(0, 10) + '...');
    
    console.log('\n=== Requesting New Tokens ===');
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
    const expiresIn = response.data.expires_in;
    const expirationTime = new Date(Date.now() + expiresIn * 1000);

    console.log('\n=== New Token Info ===');
    console.log('New refresh token:', newRefreshToken.slice(0, 10) + '...');
    console.log('Expires in:', expiresIn, 'seconds');
    console.log('Expiration time:', expirationTime.toLocaleString());

    // Update .env file
    const envPath = path.join(__dirname, '../../.env');
    console.log('\n=== Updating .env file ===');
    console.log('ENV path:', envPath);
    
    let envContent = await fs.readFile(envPath, 'utf-8');
    
    envContent = envContent.replace(
      /TWITTER_REFRESH_TOKEN=.*/,
      `TWITTER_REFRESH_TOKEN=${newRefreshToken}`
    );
    
    if (envContent.includes('TWITTER_TOKEN_EXPIRES_AT=')) {
      envContent = envContent.replace(
        /TWITTER_TOKEN_EXPIRES_AT=.*/,
        `TWITTER_TOKEN_EXPIRES_AT=${expirationTime.toISOString()}`
      );
    } else {
      envContent += `\nTWITTER_TOKEN_EXPIRES_AT=${expirationTime.toISOString()}`;
    }

    await fs.writeFile(envPath, envContent);
    console.log('\n✅ Successfully updated .env file');
    
  } catch (error) {
    console.error('\n=== Error Details ===');
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else {
      console.error('Error:', error);
    }
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRefreshWorkflow().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export { testRefreshWorkflow }; 