# Use Node 20 (yt-dlp requires Node >= 20 for JS runtime)
FROM node:20-alpine

WORKDIR /app

# Install yt-dlp via pip with EJS challenge solver scripts, plus ffmpeg
# Also install curl for checking connectivity
# Update pip first to ensure we get the latest yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg curl \
    && pip3 install --break-system-packages --upgrade pip \
    && pip3 install --break-system-packages --upgrade "yt-dlp[default]" \
    && yt-dlp --version

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy environment variables
COPY .env.local .env.local

# Copy the rest of the app
COPY . .

# Build the Next.js app
RUN pnpm build

# Expose port
EXPOSE 3000

# Start app
CMD ["pnpm", "start"]
