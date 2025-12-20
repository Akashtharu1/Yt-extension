FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
