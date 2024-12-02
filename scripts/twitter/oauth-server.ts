import { Client, auth } from 'twitter-api-sdk';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const port = 3000;

const clientId = process.env.TWITTER_CLIENT_ID!;
const clientSecret = process.env.TWITTER_CLIENT_SECRET!;

// Store code verifier globally so it's accessible in the callback
let CODE_VERIFIER: string;
let STATE: string;

// Initialize the auth process
function initializeAuth() {
  // Generate PKCE code verifier
  CODE_VERIFIER = crypto.randomBytes(32).toString('base64url');
  
  // Generate state for CSRF protection
  STATE = crypto.randomBytes(32).toString('base64url');
  
  // Generate code challenge from verifier
  const CODE_CHALLENGE = CODE_VERIFIER; // For plain method, challenge is same as verifier

  // Initialize Twitter OAuth 2.0 client
  const authClient = new auth.OAuth2User({
    client_id: clientId,
    client_secret: clientSecret,
    callback: `http://127.0.0.1:${port}/callback`,
    scopes: ["tweet.read", "users.read", "bookmark.read", "offline.access"],
  });

  // Construct the authorization URL
  const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', `http://127.0.0.1:${port}/callback`);
  authUrl.searchParams.append('scope', 'tweet.read users.read bookmark.read offline.access');
  authUrl.searchParams.append('state', STATE);
  authUrl.searchParams.append('code_challenge', CODE_CHALLENGE);
  authUrl.searchParams.append('code_challenge_method', 'plain');

  return { authUrl: authUrl.toString(), authClient };
}

async function updateEnvFile(refreshToken: string) {
  const envPath = path.join(__dirname, '../../.env');
  let envContent = await fs.readFile(envPath, 'utf-8');
  
  if (envContent.includes('TWITTER_REFRESH_TOKEN=')) {
    envContent = envContent.replace(
      /TWITTER_REFRESH_TOKEN=.*/,
      `TWITTER_REFRESH_TOKEN=${refreshToken}`
    );
  } else {
    envContent += `\nTWITTER_REFRESH_TOKEN=${refreshToken}`;
  }
  
  await fs.writeFile(envPath, envContent);
  console.log('✅ Updated .env file with refresh token');
}

// Initialize auth and get URLs
const { authUrl, authClient } = initializeAuth();
const client = new Client(authClient);

console.log('\n🔑 Starting Twitter OAuth flow...');
console.log('\n📋 Please copy and paste this URL into your browser:\n');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n⏳ Waiting for authentication callback...\n');

let server: any;

app.get('/callback', async (req: Request, res: Response) => {
  try {
    const { state, code } = req.query as { state?: string; code?: string };
    
    if (!state || !code) {
      throw new Error('Missing state or code');
    }

    if (state !== STATE) {
      throw new Error('State mismatch. Possible CSRF attack.');
    }

    console.log('\n🔐 Authorization Code:', code);
    console.log('🔑 Code Verifier:', CODE_VERIFIER);

    // Exchange code for tokens using axios directly
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        code_verifier: CODE_VERIFIER,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${JSON.stringify(tokenData)}`);
    }

    if (tokenData.refresh_token) {
      await updateEnvFile(tokenData.refresh_token);
      console.log('🔄 Refresh Token:', tokenData.refresh_token);
    }

    // Create new client with the access token
    const newClient = new Client(tokenData.access_token);
    const userResponse = await newClient.users.findMyUser();
    const username = userResponse.data?.username;
    
    if (username) {
      console.log('✅ Successfully authenticated as:', username);
    }
    
    res.send('Authentication successful! You can close this window.');
    
    setTimeout(() => {
      server.close();
      console.log('\n🎉 Authentication complete! You can now run your scripts.');
      process.exit(0);
    }, 1000);
    
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Authentication failed. Please try again.');
    process.exit(1);
  }
});

server = app.listen(port, '127.0.0.1', () => {
  console.log('\n🚀 Server started on http://127.0.0.1:3000');
});

// Handle server shutdown
process.on('SIGINT', () => {
  server.close();
  process.exit();
}); 