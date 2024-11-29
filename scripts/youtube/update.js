const fs = require('fs');
const path = require('path');
const axios = require('axios');

const YOUTUBE_DATA_PATH = path.join(process.cwd(), 'youtube', 'data.json');
const YOUTUBE_METADATA_PATH = path.join(process.cwd(), 'youtube', 'metadata.json');

async function fetchYouTubeData() {
  const channelId = 'UCnEHCrot2HkySxMTmDPhZyg';
  const maxResults = 12;
  const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    console.log('Fetching YouTube data...');
    
    // Fetch video list
    const videosResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=${maxResults}&type=video`
    );

    const videoIds = videosResponse.data.items.map(item => item.id.videoId).join(',');

    // Fetch video statistics
    const statsResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${videoIds}&part=statistics`
    );

    // Fetch channel info
    const channelResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?key=${apiKey}&id=${channelId}&part=statistics,snippet`
    );

    // Combine video data
    const videos = videosResponse.data.items.map((item, index) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnails: item.snippet.thumbnails,
      statistics: statsResponse.data.items[index].statistics
    }));

    // Update video data
    const videoData = {
      lastUpdated: new Date().toISOString(),
      videos
    };

    // Update metadata
    const metadata = {
      channelId,
      channelName: channelResponse.data.items[0].snippet.title,
      lastFetched: new Date().toISOString(),
      totalVideos: channelResponse.data.items[0].statistics.videoCount,
      subscriberCount: channelResponse.data.items[0].statistics.subscriberCount,
      viewCount: channelResponse.data.items[0].statistics.viewCount
    };

    // Write files
    fs.writeFileSync(YOUTUBE_DATA_PATH, JSON.stringify(videoData, null, 2));
    fs.writeFileSync(YOUTUBE_METADATA_PATH, JSON.stringify(metadata, null, 2));

    console.log('YouTube data updated successfully');
  } catch (error) {
    console.error('Error updating YouTube data:', error);
    process.exit(1);
  }
}

fetchYouTubeData(); 