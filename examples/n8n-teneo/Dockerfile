FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Create SDK directory and copy SDK source files
WORKDIR /app/teneo-consumer-sdk

# Copy SDK files
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

# Install SDK dependencies and build
RUN npm install && npm run build

# Switch to app directory for the service
WORKDIR /app/service

# Copy example service files
COPY examples/n8n-teneo/package.json examples/n8n-teneo/package-lock.json* ./
COPY examples/n8n-teneo/index.ts ./

# Update package.json to point to local SDK
RUN sed -i 's|"@teneo-protocol/sdk": "file:../../"|"@teneo-protocol/sdk": "file:../teneo-consumer-sdk"|g' package.json

# Fix the import path in index.ts to use the installed package instead of relative path
RUN sed -i "s|from '../../dist/index.js'|from '@teneo-protocol/sdk'|g" index.ts

# Install service dependencies
RUN npm install

# Build service TypeScript (inline, no tsconfig needed)
RUN npx tsc --module ES2022 --target ES2022 --moduleResolution node --esModuleInterop --skipLibCheck --strict false index.ts

# Expose port
EXPOSE 3000

# Run service
CMD ["node", "index.js"]
