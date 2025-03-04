# Stage 1: Build the Next.js app and install dependencies
FROM node:20-bullseye AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install system dependencies for zbar (CRUCIAL!)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libzbar-dev \
    cmake \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-dev \
    python3-opencv

# Install Node.js dependencies
RUN npm install

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies (AFTER Node.js and zbar system libs)
RUN python3 -m pip install -r requirements.txt

RUN pip3 install opencv-python

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Create the final image (smaller and more efficient)
FROM node:20-bullseye

WORKDIR /app

# Copy the built Next.js app
COPY --from=build /app/.next ./.next
COPY --from=build /app/.next/public ./public
COPY --from=build /app/package*.json ./
#COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules

# Copy zbar libraries from the build stage
#COPY --from=build /usr/lib/libzbar* /usr/lib/
#COPY --from=build /usr/bin/zbar* /usr/bin/

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
