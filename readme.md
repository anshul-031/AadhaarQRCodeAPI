# Aadhaar QR Code Scanner & API

A comprehensive solution for scanning and processing Aadhaar QR codes using various input methods including camera, external scanners, file upload, and manual entry.

## Features

- Multiple input methods:
  - External Scanner Support (via Desktop Scanner Service)
  - Camera-based QR scanning
  - File upload
  - Manual data entry
- Real-time QR code processing
- Detailed information display
- Background check results
- Responsive design
- Local storage for preferences

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/aadhaar-qr-code-api.git
cd aadhaar-qr-code-api
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. For scanner support, set up the Desktop Scanner Service:
```bash
cd desktop-scanner
npm install
npm run build
```

## Usage

1. Start the web application:
```bash
npm run dev
```

2. If using scanner functionality, start the Desktop Scanner Service:
```bash
cd desktop-scanner
npm start
```

3. Open the web application in your browser:
```
http://localhost:3000
```

## Scanner Integration

The application includes a desktop scanner service that enables integration with external scanners. To use this feature:

1. Make sure you have a compatible scanner connected to your computer
2. Install and run the Desktop Scanner Service (see desktop-scanner/README.md for details)
3. Use the "Scan" tab in the web interface to access scanner functionality
4. Scanner settings and preferences are automatically saved for future use

### Scanner Requirements

- Windows: TWAIN-compatible scanner
- Linux/macOS: SANE-compatible scanner
- Proper scanner drivers installed
- Scanner service running on the same machine as the browser

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/awesome-feature`)
3. Commit your changes (`git commit -am 'Add awesome feature'`)
4. Push to the branch (`git push origin feature/awesome-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

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
