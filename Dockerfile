# Stage 1: Build the Next.js app and install dependencies
# FROM node:20-bullseye AS build
FROM python:3.9-slim-buster AS python-builder

WORKDIR /app

# Copy package files
# COPY package*.json ./

# RUN apk update && apk add --no-cache python3 py3-pip
# Install system dependencies for zbar (CRUCIAL!)
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends \
#     libzbar-dev \
#     cmake \
#     git \
#     build-essential \
#     python3 \
#     python3-pip \
#     python3-dev \
#     python3-opencv

# Install Node.js dependencies

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies (AFTER Node.js and zbar system libs)
RUN pip3 install -r requirements.txt

# RUN pip3 install opencv-python

# Copy application code
COPY . .


# Stage 2: Create the final image (smaller and more efficient)
FROM node:20-bullseye as node-builder

WORKDIR /app

COPY package*.json ./

RUN npm install
# Build the Next.js application
COPY . . 

RUN npm run build


FROM debian:buster-slim

RUN apt-get update && apt-get install -y nodejs python3 python3-pip

WORKDIR /app

# Copy the built Next.js app
COPY --from=node-builder /app/.next ./.next
COPY --from=node-builder /app/.next/public ./public
COPY --from=node-builder /app/package*.json ./
#COPY --from=build /app/public ./public
COPY --from=node-builder /app/node_modules ./node_modules


COPY --from=python-builder /app/lib ./lib

COPY . .

# Copy zbar libraries from the build stage
#COPY --from=build /usr/lib/libzbar* /usr/lib/
#COPY --from=build /usr/bin/zbar* /usr/bin/

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
