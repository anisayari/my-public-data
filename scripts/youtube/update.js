const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Function to chunk array into smaller arrays
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllVideos(channelId, apiKey, pageToken = null, allVideos = []) {
  try {
    const searchResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`, {
        params: {
          key: apiKey,
          channelId: channelId,
          part: 'snippet',
          order: 'date',
          maxResults: 50, // Maximum allowed per request
          type: 'video',
          pageToken: pageToken
        }
      }
    );

    allVideos.push(...searchResponse.data.items);

    // If there are more pages, fetch them recursively
    if (searchResponse.data.nextPageToken) {
      console.log(`Fetching next page of videos... (${allVideos.length} videos so far)`);
      return fetchAllVideos(channelId, apiKey, searchResponse.data.nextPageToken, allVideos);
    }

    return allVideos;
  } catch (error) {
    console.error('Error fetching videos:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchVideoDetails(videoIds, apiKey) {
  try {
    // Split video IDs into chunks of 50 (API limit)
    const chunks = chunkArray(videoIds, 50);
    let allVideoDetails = [];

    for (const chunk of chunks) {
      console.log(`Fetching details for ${chunk.length} videos...`);
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos`, {
          params: {
            key: apiKey,
            id: chunk.join(','),
            part: 'contentDetails,statistics,snippet'
          }
        }
      );
      allVideoDetails.push(...response.data.items);
    }

    return allVideoDetails;
  } catch (error) {
    console.error('Error fetching video details:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchYouTubeData() {
  const channelId = 'UCnEHCrot2HkySxMTmDPhZyg';
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YouTube API key is not set');
  }

  try {
    console.log('Starting YouTube data fetch process...');
    console.log('Current working directory:', process.cwd());
    
    // Define paths
    const youtubeDir = path.join(process.cwd(), 'youtube');
    const dataPath = path.join(youtubeDir, 'data.json');
    const metadataPath = path.join(youtubeDir, 'metadata.json');
    
    console.log('YouTube directory path:', youtubeDir);

    // Test API key and get channel info
    console.log('\nFetching channel info...');
    const channelResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${apiKey}`
    );

    if (!channelResponse.data.items?.length) {
      throw new Error('Invalid channel ID or API key');
    }

    const channelInfo = channelResponse.data.items[0];
    console.log('✓ Channel found:', channelInfo.snippet.title);

    // Fetch all videos
    console.log('\nFetching all videos...');
    const allVideos = await fetchAllVideos(channelId, apiKey);
    console.log(`✓ Found ${allVideos.length} total videos`);

    // Get video IDs
    const videoIds = allVideos.map(item => item.id.videoId);

    // Fetch detailed video information in chunks
    console.log('\nFetching video details...');
    const videoDetails = await fetchVideoDetails(videoIds, apiKey);
    console.log(`✓ Fetched details for ${videoDetails.length} videos`);

    // Combine all video data
    console.log('\nProcessing video data...');
    const videos = allVideos.map(item => {
      const details = videoDetails.find(v => v.id === item.id.videoId);
      const duration = details?.contentDetails?.duration || 'N/A';
      const isShort = duration.match(/PT(\d+)S/) && parseInt(duration.match(/PT(\d+)S/)[1]) <= 60;
      
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnails: item.snippet.thumbnails,
        statistics: details?.statistics || {},
        duration: duration,
        isShort: isShort,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        engagement: {
          views: parseInt(details?.statistics?.viewCount || '0'),
          likes: parseInt(details?.statistics?.likeCount || '0'),
          comments: parseInt(details?.statistics?.commentCount || '0')
        }
      };
    });

    // Sort videos by publish date (newest first)
    videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    // Update video data
    const videoData = {
      lastUpdated: new Date().toISOString(),
      totalVideos: videos.length,
      videos
    };

    // Update metadata
    const metadata = {
      channelId,
      channelName: channelInfo.snippet.title,
      channelDescription: channelInfo.snippet.description,
      customUrl: channelInfo.snippet.customUrl,
      lastFetched: new Date().toISOString(),
      totalVideos: channelInfo.statistics.videoCount,
      subscriberCount: channelInfo.statistics.subscriberCount,
      viewCount: channelInfo.statistics.viewCount,
      statistics: {
        totalViews: videos.reduce((sum, video) => sum + video.engagement.views, 0),
        totalLikes: videos.reduce((sum, video) => sum + video.engagement.likes, 0),
        totalComments: videos.reduce((sum, video) => sum + video.engagement.comments, 0),
        averageViews: Math.round(videos.reduce((sum, video) => sum + video.engagement.views, 0) / videos.length),
        shortVideosCount: videos.filter(video => video.isShort).length
      }
    };

    // Ensure directory exists
    try {
      await fs.access(youtubeDir);
      console.log('YouTube directory exists');
    } catch (error) {
      console.log('Creating YouTube directory...');
      await fs.mkdir(youtubeDir, { recursive: true });
      console.log('YouTube directory created');
    }

    // Write files
    console.log('\nWriting files...');
    await fs.writeFile(dataPath, JSON.stringify(videoData, null, 2));
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log('\nSummary:');
    console.log(`- Total videos processed: ${videos.length}`);
    console.log(`- Channel name: ${metadata.channelName}`);
    console.log(`- Total channel videos: ${metadata.totalVideos}`);
    console.log(`- Subscriber count: ${metadata.subscriberCount}`);
    console.log(`- Short videos: ${metadata.statistics.shortVideosCount}`);
    console.log(`- Average views: ${metadata.statistics.averageViews}`);
    console.log(`- Last updated: ${videoData.lastUpdated}`);
    
    console.log('\n✅ YouTube data updated successfully');
  } catch (error) {
    console.error('\n❌ Error updating YouTube data:', error);
    if (axios.isAxiosError(error)) {
      console.error('API Response:', error.response?.data);
      console.error('Request URL:', error.config?.url);
    }
    process.exit(1);
  }
}

fetchYouTubeData(); 