# =========================================================
# Stage 1: Build the TypeScript codebase
# =========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies (including devDependencies for compile)
RUN npm ci

# Copy the rest of the application source
COPY src ./src

# Compile TypeScript to production JavaScript in dist/
RUN npm run build

# =========================================================
# Stage 2: Production runner
# =========================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled JavaScript bundle from the build stage
COPY --from=builder /app/dist ./dist

# Expose backend port
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
