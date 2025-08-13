# ---------- Build stage ----------
FROM node:20-slim AS build

WORKDIR /workspace

# Install system deps if needed (openssl for prisma)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files and install deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma clients (two schemas)
RUN npx prisma generate --schema=./prisma/schema.prisma \
 && npx prisma generate --schema=./prisma/schema.timescale.prisma

# Build TypeScript
RUN npm run build

# ---------- Runtime stage ----------
FROM mcr.microsoft.com/azure-functions/node:4-node20

WORKDIR /home/site/wwwroot

# Copy built JS and node_modules
COPY --from=build /workspace/dist ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/host.json ./host.json

EXPOSE 7071

# Start Functions host
CMD ["bash", "-lc", "func start --script-root ."]
