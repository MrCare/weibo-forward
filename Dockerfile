FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/app.db
ENV PORT=3000
ENV HEADLESS=true
ENV SKIP_WEIBO_HOME_VERIFY=1

EXPOSE 3000

# 数据卷挂载 /app/data（SQLite + 租户登录态）
CMD ["npm", "run", "start:api"]
