# Use Node 18
FROM node:18-alpine

WORKDIR /app

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
