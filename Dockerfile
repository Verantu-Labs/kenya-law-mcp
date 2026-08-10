FROM oven/bun:1.2-slim AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .
RUN bun run build

EXPOSE 8080
ENTRYPOINT ["bun", "run", "src/index.ts"]
