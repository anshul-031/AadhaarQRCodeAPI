# Stage 1: Build Node.js app
FROM node:20-bullseye AS node-build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Stage 2: Build Python dependencies
FROM python:3.9-slim-buster AS python-build

WORKDIR /app

COPY requirements.txt .

RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Stage 3: Final image
FROM debian:bullseye-slim

# Install runtime dependencies (including Node.js 20)
RUN apt-get update && apt-get install -y curl gnupg
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
#Corrected line.
RUN apt-get install -y nodejs python3 python3-pip libzbar0

# Install production node modules.
WORKDIR /app
COPY --from=node-build /app/package*.json ./
RUN npm install --production

# Copy built Next.js app
COPY --from=node-build /app/.next ./.next
COPY --from=node-build /app/scripts ./scripts

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
