# Use official Bun image
FROM oven/bun:1.2.23-slim AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json package-lock.json* bun.lockb* ./
RUN bun install --frozen-lockfile

# Build the project
FROM base AS build
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production image
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Set Node.js version for compatibility
ENV NODE_VERSION=22.18.0

ENTRYPOINT ["bun", "run", "dist/index.js"]
