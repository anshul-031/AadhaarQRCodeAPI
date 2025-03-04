import { NextRequest, NextResponse } from 'next/server';
import { PythonShell, Options } from 'python-shell';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

interface AadhaarQRData {
  uid: string;
  name: string;
  gender: string;
  yob: string;
  co: string;
  vtc: string;
  po: string;
  dist: string;
  state: string;
  pc: string;
}

interface PythonResponse {
  success: boolean;
  data?: AadhaarQRData;
  error?: string;
}

export async function POST(request: NextRequest) {
  const tempDir = path.join(process.cwd(), 'temp');
  const tempFilePath = path.join(tempDir, `${uuidv4()}.txt`);

  try {
    const body = await request.json();
    const { qrData } = body;

    if (!qrData) {
      return NextResponse.json(
        { error: 'QR data is required' },
        { status: 400 }
      );
    }

    // Create temp directory if it doesn't exist
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (err) {
      // Ignore if directory already exists
    }

    // Write QR data to temporary file
    await fs.writeFile(tempFilePath, qrData);

    // Set up Python shell options
    const options: Options = {
      mode: 'text' as const,
      pythonPath: 'python3',
      scriptPath: path.join(process.cwd(), './../scripts'),
      args: [tempFilePath]
    };

    // Execute Python script
    try {
      const results = await PythonShell.run('parse_aadhaar.py', options);
      const response: PythonResponse = JSON.parse(results[0]);

      if (!response.success) {
        return NextResponse.json(
          { error: response.error || 'Failed to parse QR data' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        data: response.data,
        message: 'Aadhaar data parsed successfully'
      });

    } catch (pythonError) {
      console.error('Python script error:', pythonError);
      return NextResponse.json(
        { error: 'Failed to process QR data' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    // Clean up temporary file
    try {
      await fs.unlink(tempFilePath);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}