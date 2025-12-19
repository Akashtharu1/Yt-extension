const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const app = express();

app.use(cors());
app.use(express.json());

// Download video using ytdl-core
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { quality = '720', type = 'video' } = req.query;
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    // Get video info
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    
    let format;
    const isAudio = type === 'audio';
    
    if (isAudio) {
      format = ytdl.chooseFormat(info.formats, { 
        quality: 'highestaudio',
        filter: 'audioonly'
      });
    } else {
      const qualityMap = {
        '2160': 'highest',
        '1440': 'highest', 
        '1080': 'highest',
        '720': 'highest',
        '480': 'lowest',
        '360': 'lowest'
      };
      
      format = ytdl.chooseFormat(info.formats, { 
        quality: qualityMap[quality] || 'highest',
        filter: 'videoandaudio'
      });
    }
    
    if (!format) {
      return res.status(404).json({ error: 'No suitable format found' });
    }
    
    const ext = isAudio ? 'm4a' : 'mp4';
    const contentType = isAudio ? 'audio/mp4' : 'video/mp4';
    
    // Set headers
    res.header('Content-Disposition', `attachment; filename="${title}_${quality}.${ext}"`);
    res.header('Content-Type', contentType);
    res.header('Content-Length', format.contentLength || '');
    
    // Stream the video
    const stream = ytdl(url, { format });
    
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
      }
    });
    
    req.on('close', () => {
      stream.destroy();
    });
    
  } catch (error) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(400).json({ error: 'Download failed: ' + error.message });
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'youtube-downloader',
    time: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
