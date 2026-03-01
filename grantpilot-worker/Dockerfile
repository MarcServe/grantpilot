# Playwright image includes Node and Chromium for browser automation
FROM mcr.microsoft.com/playwright/node:v1.49.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
