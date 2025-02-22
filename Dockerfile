FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    libzbar0 \
    libzbar-dev \
    python3-opencv \
    zbar-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and Python requirements first
COPY package*.json requirements.txt ./

# Install Node.js dependencies
RUN npm ci

# Install Python dependencies directly
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]