const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
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

// Helper to download thumbnail
function downloadThumbnail(videoId, destPath) {
  return new Promise((resolve, reject) => {
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const file = fs.createWriteStream(destPath);
    
    https.get(thumbnailUrl, (response) => {
      // If maxres not available, try hqdefault
      if (response.statusCode === 404) {
        const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        https.get(hqUrl, (res2) => {
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(destPath);
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }
    }).on('error', reject);
  });
}

// Download video using yt-dlp
app.get('/api/download/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { quality = '720', type = 'video' } = req.query;
    
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const isAudio = type === 'audio';
    
    // Get video title first
    exec(`yt-dlp --print title "${url}"`, async (error, stdout) => {
      if (error) {
        console.error('Title error:', error);
        return res.status(500).json({ error: 'Failed to get video info' });
      }
      
      const title = stdout.trim().replace(/[^a-zA-Z0-9 ]/g, '_').substring(0, 50);
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
      
      if (isAudio) {
        const tempDir = os.tmpdir();
        const tempAudio = path.join(tempDir, `${videoId}_audio`);
        const tempMp3 = path.join(tempDir, `${videoId}_320.mp3`);
        const tempMp3WithCover = path.join(tempDir, `${videoId}_final.mp3`);
        const tempThumb = path.join(tempDir, `${videoId}_thumb.jpg`);
        
        console.log('Downloading audio...');
        
        // Download best audio
        exec(`yt-dlp -f bestaudio -o "${tempAudio}.%(ext)s" --no-playlist "${url}"`, async (dlError) => {
          if (dlError) {
            console.error('Download error:', dlError);
            return res.status(500).json({ error: 'Failed to download audio' });
          }
          
          // Find the downloaded file
          const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`${videoId}_audio`));
          if (files.length === 0) {
            return res.status(500).json({ error: 'Downloaded file not found' });
          }
          
          const downloadedFile = path.join(tempDir, files[0]);
          console.log('Downloaded:', downloadedFile);
          
          // Download thumbnail
          console.log('Downloading thumbnail...');
          try {
            await downloadThumbnail(videoId, tempThumb);
            console.log('Thumbnail downloaded:', tempThumb);
          } catch (thumbErr) {
            console.error('Thumbnail download failed:', thumbErr);
          }
          
          // Convert to 320kbps MP3
          console.log('Converting to 320kbps MP3...');
          exec(`ffmpeg -y -i "${downloadedFile}" -b:a 320k -map a "${tempMp3}"`, (ffError) => {
            // Clean up original download
            try { fs.unlinkSync(downloadedFile); } catch(e) {}
            
            if (ffError) {
              console.error('FFmpeg error:', ffError);
              try { fs.unlinkSync(tempThumb); } catch(e) {}
              return res.status(500).json({ error: 'Failed to convert audio' });
            }
            
            // Add thumbnail as cover art
            const hasThumbnail = fs.existsSync(tempThumb);
            if (hasThumbnail) {
              console.log('Adding thumbnail as cover art...');
              const ffmpegCmd = `ffmpeg -y -i "${tempMp3}" -i "${tempThumb}" -map 0:a -map 1:0 -c:a copy -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -metadata title="${title}" "${tempMp3WithCover}"`;
              
              exec(ffmpegCmd, (coverError) => {
                // Clean up temp files
                try { fs.unlinkSync(tempMp3); } catch(e) {}
                try { fs.unlinkSync(tempThumb); } catch(e) {}
                
                const finalFile = coverError ? tempMp3 : tempMp3WithCover;
                
                if (coverError) {
                  console.error('Cover art error:', coverError);
                  // Use mp3 without cover
                }
                
                if (!fs.existsSync(finalFile)) {
                  return res.status(500).json({ error: 'Final file not found' });
                }
                
                const stat = fs.statSync(finalFile);
                console.log('Final MP3:', finalFile, 'Size:', stat.size);
                
                res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_320kbps.mp3"`);
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Content-Length', stat.size);
                
                const readStream = fs.createReadStream(finalFile);
                readStream.pipe(res);
                
                readStream.on('end', () => {
                  try { fs.unlinkSync(finalFile); } catch(e) {}
                });
                
                readStream.on('error', (err) => {
                  console.error('Stream error:', err);
                  try { fs.unlinkSync(finalFile); } catch(e) {}
                });
              });
            } else {
              // No thumbnail, send mp3 without cover
              const stat = fs.statSync(tempMp3);
              
              res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_320kbps.mp3"`);
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Content-Length', stat.size);
              
              const readStream = fs.createReadStream(tempMp3);
              readStream.pipe(res);
              
              readStream.on('end', () => {
                try { fs.unlinkSync(tempMp3); } catch(e) {}
              });
            }
          });
        });
        
      } else {
        // Video: Stream directly
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${quality}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');
        
        const args = [
          '-f', `best[height<=${quality}][ext=mp4]/best[ext=mp4]/best`,
          '-o', '-',
          '--no-playlist',
          '--no-warnings',
          url
        ];
        
        const ytdlp = spawn('yt-dlp', args);
        ytdlp.stdout.pipe(res);
        
        ytdlp.stderr.on('data', (data) => {
          console.error('yt-dlp:', data.toString());
        });
        
        ytdlp.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
          }
        });
        
        req.on('close', () => ytdlp.kill());
      }
    });
    
  } catch (error) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
