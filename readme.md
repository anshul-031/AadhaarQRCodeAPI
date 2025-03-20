# Aadhaar QR Code API

This project is a Next.js application that parses Aadhaar QR code data using a Python script.

## Prerequisites

*   Node.js
*   Python 3
*   python-shell package (`pip install python-shell`)
*   PostgreSQL

## Setup

1.  Clone the repository.
2.  Install the dependencies: `npm install`
3.  Set up PostgreSQL:
    *   Install PostgreSQL on your local machine or use a cloud-based PostgreSQL service.
    *   Create a database named `instantverify_test`.
    *   Obtain the database connection string.
    *   Set the `DATABASE_URL` environment variable in the `.env` file with the connection string.
4.  Start the Next.js development server: `npm run dev`
5.  Send a POST request to the `/api/aadhaar` endpoint with the QR code data in the request body.

## Notes

*   The `parse_aadhaar.py` script is located in the `public/scripts` directory.
*   The Next.js application executes the Python script using the `python-shell` package.
