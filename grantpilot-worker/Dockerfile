# Playwright image includes Node and Chromium for browser automation
# See https://playwright.dev/docs/docker (v1.49.0-noble not on MCR; use v1.58.2-noble)
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
