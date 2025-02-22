# Use a suitable base image (multi-stage build for smaller image)
FROM node:16-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install system dependencies for zbar (CRUCIAL!)
RUN apk update && apk add --no-cache libzbar0 zbar-tools build-essential cmake git

# Install Node.js dependencies
RUN npm ci

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies
RUN python3 -m pip install -r requirements.txt

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Multi-stage build: Create a smaller production image
FROM node:16-alpine

WORKDIR /app

# Copy built Next.js application
COPY --from=build /app/.next ./.next
COPY --from=build /app/package*.json ./
COPY --from=build /app/public ./public


# Copy system dependencies (zbar)
COPY --from=build /usr/lib/libzbar* /usr/lib/
COPY --from=build /usr/bin/zbar* /usr/bin/

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]