# Stage 1: Build the frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run the server
FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including tsx)
RUN npm ci

# Copy frontend build from builder
COPY --from=builder /app/dist ./dist

# Copy source code (server.ts and src/ are needed)
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the server
CMD ["npx", "tsx", "server.ts"]