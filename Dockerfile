FROM node:20-slim

# Install system dependencies and configure apt for zbar
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    libzbar0 \
    libzbar-dev \
    python3-opencv \
    zbar-tools \
    pkg-config \
    build-essential \
    && ldconfig \
    && rm -rf /var/lib/apt/lists/*

# Set environment variable for zbar library path
ENV LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH

WORKDIR /app

# Copy package files and Python requirements first
COPY package*.json ./
COPY requirements.txt ./

# Install Node.js dependencies
RUN npm ci

# Install Python dependencies with specific versions
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
ENV PORT=3000
CMD ["npm", "start"]