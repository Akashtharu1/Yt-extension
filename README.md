# YouTube Downloader Backend

Node.js backend server for handling video downloads.

## Setup

1. **Install Node.js** (v16 or higher)

2. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Start server:**
   ```bash
   npm start
   ```
   Server runs on http://localhost:3000

## API Endpoints

- `GET /api/video-info/:videoId` - Get video metadata
- `GET /api/download/:videoId?quality=highest` - Download video

## Usage with Extension

1. Start the backend server first
2. Load the extension in browser
3. Extension will connect to localhost:3000 automatically

## Dependencies

- **express** - Web server framework
- **cors** - Cross-origin requests
- **ytdl-core** - YouTube video extraction

## Production Notes

For production deployment:
- Use environment variables for configuration
- Add rate limiting and authentication
- Deploy to cloud service (AWS, Heroku, etc.)
- Update extension manifest with production URL
