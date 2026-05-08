# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy only the files needed for installation to cache layers
COPY package.json yarn.lock* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Set production environment
NODE_ENV=production

# Copy only built assets and production dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Default configuration
ENV PORT=3000
ENV PERSISTENCE=memory
# ENV REDIS_URL=redis://localhost:6379
# ENV AUTH_TOKEN=optional_secure_token

EXPOSE 3000

# Start the standalone server
CMD ["npm", "start"]
