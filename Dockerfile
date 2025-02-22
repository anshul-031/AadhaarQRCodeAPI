# Use a Node.js base image
FROM node:16-alpine # Or a suitable Node.js image

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install system dependencies for zbar (IMPORTANT!)
RUN apk update && apk add --no-cache libzbar0 zbar-tools build-essential cmake git

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Your build process (if needed)
# RUN npm run build

# Command to start your application
CMD ["npm", "start"]