const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// Install yt-dlp on first run
const installYtDlp = () => {
  return new Promise((resolve) => {
    const install = spawn('pip', ['install', 'yt-dlp'], { stdio: 'inherit' });
    install.on('close', () => resolve());
  });
};

// Initialize yt-dlp installation
let ytdlpReady = false;
installYtDlp().then(() => {
  ytdlpReady = true;
  console.log('yt-dlp installed successfully');
});

// Get format string based on quality and type
function getFormat(quality, type) {
  if (type === 'audio') {
    switch (quality) {
      case 'audio_high':
        return '140/bestaudio[ext=m4a]/bestaudio';
      case 'audio_medium':
        return '251/140/bestaudio';
      case 'audio_low':
        return '139/249/worstaudio';
      default:
        return '140/bestaudio';
    }
  }
  
  switch (quality) {
    case '2160':
      return 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160]';
    case '1440':
      return 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440]';
    case '1080':
      return 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]';
    case '720':
      return 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/22/best[height<=720]';
    case '480':
      return 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]';
    case '360':
      return 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/18/best[height<=360]';
    default:
      return '22/18/best';
  }
}

// Download video using yt-dlp
app.get('/api/download/:videoId', async (req, res) => {
  try {
    if (!ytdlpReady) {
      return res.status(503).json({ error: 'Server is initializing, please try again in a moment' });
    }

    const { videoId } = req.params;
    const { quality = '720', type = 'video' } = req.query;
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    // Get video title first
    const titleProcess = spawn('yt-dlp', [
      '--get-title',
      '--no-warnings',
      url
    ]);
    
    let title = 'video';
    
    titleProcess.stdout.on('data', (data) => {
      title = data.toString().trim().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    });
    
    await new Promise((resolve) => titleProcess.on('close', resolve));
    
    const format = getFormat(quality, type);
    const isAudio = type === 'audio';
    const ext = isAudio ? 'm4a' : 'mp4';
    const contentType = isAudio ? 'audio/mp4' : 'video/mp4';
    
    // Set headers
    res.header('Content-Disposition', `attachment; filename="${title}_${quality}.${ext}"`);
    res.header('Content-Type', contentType);
    
    // Build yt-dlp arguments
    const args = [
      '-f', format,
      '-o', '-',
      '--no-warnings',
      '--quiet',
      '--no-check-certificates'
    ];
    
    if (!isAudio) {
      args.push('--merge-output-format', 'mp4');
    }
    
    args.push(url);
    
    // Stream using yt-dlp
    const ytdlp = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    ytdlp.stdout.pipe(res);
    
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp:', data.toString());
    });
    
    req.on('close', () => {
      ytdlp.kill('SIGTERM');
    });
    
    ytdlp.on('error', (err) => {
      console.error('yt-dlp error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
      }
    });
    
    ytdlp.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({ error: 'Download failed with code ' + code });
      }
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
    ytdlpReady,
    time: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
