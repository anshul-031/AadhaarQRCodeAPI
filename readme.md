# Aadhaar QR Code API

This project is a Next.js application that parses Aadhaar QR code data using a Python script.

## Prerequisites

*   Node.js
*   Python 3
*   python-shell package (`pip install python-shell`)

## Setup

1.  Clone the repository.
2.  Install the dependencies: `npm install`
3.  Move the `scripts/parse_aadhaar.py` file to the `public/scripts` directory: `mkdir -p public/scripts && mv scripts/parse_aadhaar.py public/scripts/parse_aadhaar.py`

## Usage

1.  Start the Next.js development server: `npm run dev`
2.  Send a POST request to the `/api/aadhaar` endpoint with the QR code data in the request body.

## Notes

*   The `parse_aadhaar.py` script is located in the `public/scripts` directory.
*   The Next.js application executes the Python script using the `python-shell` package.
