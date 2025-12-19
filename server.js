const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'youtube-downloader',
    time: new Date().toISOString() 
  });
});

// Download video
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { quality = '720', type = 'video' } = req.query;
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    
    let format;
    const isAudio = type === 'audio';
    
    if (isAudio) {
      format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    } else {
      format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
    }
    
    if (!format) {
      return res.status(404).json({ error: 'No suitable format found' });
    }
    
    const ext = isAudio ? 'm4a' : 'mp4';
    res.header('Content-Disposition', `attachment; filename="${title}_${quality}.${ext}"`);
    res.header('Content-Type', isAudio ? 'audio/mp4' : 'video/mp4');
    
    const stream = ytdl(url, { format });
    stream.pipe(res);
    
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    req.on('close', () => stream.destroy());
    
  } catch (error) {
    if (!res.headersSent) res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
