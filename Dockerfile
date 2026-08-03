FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev
COPY . .
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium NODE_ENV=production
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","src/index.js"]
