const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Simple redirect-based download
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { quality = '720', type = 'video' } = req.query;
    
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    // Use a public YouTube download service
    const downloadUrl = `https://www.y2mate.com/youtube/${videoId}`;
    
    // Return download info instead of streaming
    res.json({
      success: true,
      videoId,
      quality,
      type,
      message: 'Use a YouTube downloader website like y2mate.com or savefrom.net',
      url: `https://www.youtube.com/watch?v=${videoId}`
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(400).json({ error: 'Request failed: ' + error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'youtube-downloader-simple',
    time: new Date().toISOString() 
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'YouTube Downloader API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
