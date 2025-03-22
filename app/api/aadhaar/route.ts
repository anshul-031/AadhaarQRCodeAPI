import { NextRequest, NextResponse } from 'next/server';
import { PythonShell, Options } from 'python-shell';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { logFailedQr, logSuccessfulQr } from '@/lib/db';

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
    const { qrData, userName } = body;

    if (!qrData) {
      return NextResponse.json(
        { error: 'QR data is required' },
        { status: 400 }
      );
    }

    if (!userName) {
      return NextResponse.json(
        { error: 'User name is required' },
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
      pythonPath: 'python',
      args: [tempFilePath]
    };

    // Execute Python script
    try {
      console.log('Executing Python script...');
      
      // Create a new PythonShell instance to capture logs
      const pyshell = new PythonShell('scripts/parse_aadhaar.py', options);
      
      // Store all messages
      const messages: string[] = [];
      
      // Run the script and get results
      const results = await new Promise<string[]>((resolve, reject) => {
        // Capture stdout
        pyshell.on('message', function (message: string) {
          console.log('Python stdout:', message);
          messages.push(message);
        });
        
        // Capture stderr
        pyshell.on('stderr', function (stderr: string) {
          console.log('Python stderr:', stderr);
        });

        pyshell.end((err: Error | null) => {
          if (err) reject(err);
          resolve(messages);
        });
      });
      
      console.log('Python script executed successfully.');
      
      // The last message that starts with '{' and ends with '}' should be our JSON result
      const jsonLine = results.find(line =>
        line.trim().startsWith('{') &&
        line.trim().endsWith('}') &&
        line.includes('"success":')
      );

      if (!jsonLine) {
        console.error('Failed to find valid JSON in Python output. Full output:', results);
        return NextResponse.json(
          { error: 'Failed to parse Python script output' },
          { status: 500 }
        );
      }

      const response: PythonResponse = JSON.parse(jsonLine);

      if (!response.success) {
        const errorMessage = response.error || 'Failed to parse QR data';
        await logFailedQr({
          qr_details: qrData,
          error_message: errorMessage,
          timestamp: new Date(),
          user_name: userName
        });
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      await logSuccessfulQr({
        timestamp: new Date(),
        user_name: userName
      });

      return NextResponse.json({
        success: true,
        data: response.data,
        message: 'Aadhaar data parsed successfully'
      });

    } catch (pythonError) {
      console.error('Python script error:', pythonError);
      console.log('Python script error:', pythonError);
      await logFailedQr({
        qr_details: qrData,
        error_message: 'Python script error',
        timestamp: new Date(),
        user_name: userName
      });
      return NextResponse.json(
        { error: 'Failed to process QR data' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API error:', error);
    console.log('API error:', error);
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