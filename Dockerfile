# Stage 1: Build the Next.js app and install dependencies
FROM node:16 AS build  # Use standard Node image instead of Alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install system dependencies for zbar (CRUCIAL!)
RUN apt-get update && \
    apt-get install -y \
    zbar-tools \
    cmake \
    git \
    build-essential

# Install Node.js dependencies
RUN npm ci

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies (AFTER Node.js and zbar system libs)
RUN python3 -m pip install -r requirements.txt

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Create the final image (smaller and more efficient)
FROM node:16

WORKDIR /app

# Copy the built Next.js app
COPY --from=build /app/.next ./.next
COPY --from=build /app/package*.json ./
COPY --from=build /app/public ./public

# Copy zbar libraries from the build stage
COPY --from=build /usr/lib/libzbar* /usr/lib/
COPY --from=build /usr/bin/zbar* /usr/bin/

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
