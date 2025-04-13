import { NextRequest, NextResponse } from 'next/server';
import { logFailedQr, logSuccessfulQr } from '@/lib/db';
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import os from 'os';

interface RequestBody {
  qrData: string;
  userName: string;
}

export async function POST(request: NextRequest) {
  const tempFileName = `qr_input_${randomBytes(8).toString('hex')}.txt`;
  const tempFilePath = join(os.tmpdir(), tempFileName);
  let errorOccurred = false;
  let userName: string | undefined = undefined; // Declare userName in the outer scope

  try {
    const body = await request.json() as RequestBody;
    // Assign value to the outer-scoped userName
    userName = body.userName; 
    const { qrData } = body; // Only extract qrData here

    if (!qrData) {
      errorOccurred = true;
      return NextResponse.json(
        { error: 'QR data is required' },
        { status: 400 }
      );
    }

    // Check userName *after* assignment
    if (!userName) { 
      errorOccurred = true;
      return NextResponse.json(
        { error: 'User name is required' },
        { status: 400 }
      );
    }

    // Add type check and detailed logging
    if (typeof qrData !== 'string') {
      console.error(`API Error: Expected qrData to be a string, but received type ${typeof qrData}. Value:`, qrData);
      errorOccurred = true; // Mark error occurred
      // Log failure before returning
      if (userName) { // Log only if userName was successfully extracted
          try {
              await logFailedQr({
                  qr_details: `Invalid qrData type received: ${typeof qrData}`,
                  error_message: `Expected string, got ${typeof qrData}`,
                  timestamp: new Date(),
                  user_name: userName
              });
          } catch (logError) {
              console.error("Error logging failed QR due to invalid type:", logError);
          }
      }
      return NextResponse.json(
        { error: `Invalid qrData type received: ${typeof qrData}` },
        { status: 400 }
      );
    }
    // If it's a string, proceed with logging substring
    console.log('Received QR data (string):', qrData.substring(0, 100) + '...');

    let parsedData: any;

    try {
      await writeFile(tempFilePath, qrData, 'utf8');
      console.log(`Temporary file created: ${tempFilePath}`);

      const pythonExecutable = 'python3';
      const scriptPath = join(process.cwd(), 'scripts', 'parse_aadhaar.py');
      console.log(`Executing: ${pythonExecutable} ${scriptPath} ${tempFilePath}`);
      const pythonProcess = spawn(pythonExecutable, [scriptPath, tempFilePath]);

      let scriptOutput = '';
      let scriptError = '';

      // Collect stdout (will contain logs + JSON)
      pythonProcess.stdout.on('data', (data) => {
        scriptOutput += data.toString();
      });

      // Collect stderr
      pythonProcess.stderr.on('data', (data) => {
        scriptError += data.toString();
        console.error(`Python Script Stderr Chunk: ${data}`);
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          console.log(`Python script exited with code ${code}`);
          if (scriptError) {
             console.error(`Python Script Full Stderr:\n${scriptError}`);
          }
          resolve(code ?? 1);
        });
        pythonProcess.on('error', (err) => {
          console.error('Failed to start Python script:', err);
          reject(err);
        });
      });

      // Clean up temporary file
      try {
        await unlink(tempFilePath);
        console.log(`Temporary file deleted: ${tempFilePath}`);
      } catch (unlinkError: any) {
         if (unlinkError.code !== 'ENOENT') {
             console.error(`Error deleting temporary file ${tempFilePath}:`, unlinkError);
         }
      }

      // Check for script execution errors
      if (exitCode !== 0) {
          const errorDetails = scriptError || scriptOutput || 'No output captured';
          throw new Error(`Python script exited with code ${exitCode}. Output:\n${errorDetails}`);
      }

      // Check if stdout is empty
      if (!scriptOutput.trim()) {
          throw new Error(`Python script finished successfully (code 0) but produced no output (stdout). Stderr:\n${scriptError}`);
      }

      // --- Extract JSON object from mixed stdout ---
      const jsonStart = scriptOutput.indexOf('{');
      const jsonEnd = scriptOutput.lastIndexOf('}'); 

      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
          throw new Error(`Invalid output from Python script: Could not find valid JSON object boundaries. Raw stdout:\n${scriptOutput}`);
      }

      const jsonString = scriptOutput.substring(jsonStart, jsonEnd + 1);
      // --- End JSON extraction ---


      // Parse the extracted JSON string
      try {
          console.log(`Attempting to parse extracted JSON string: ${jsonString.substring(0, 200)}...`); 
          const result = JSON.parse(jsonString);

          if (!result.success) {
            throw new Error(`Python script indicated failure: ${result.error || 'Unknown error from script'}`);
          }
          parsedData = result.data;

      } catch (parseError: any) {
          console.error(`JSON Parsing Error: ${parseError.message}`);
          console.error(`Extracted JSON String (may be truncated):\n${jsonString.substring(0, 1000)}...`); 
          console.error(`Full Raw Stdout (may be truncated):\n${scriptOutput.substring(0, 1000)}...`);
          throw new Error(`Failed to parse extracted JSON from Python script: ${parseError.message}.`);
      }


    } catch (scriptExecError) {
        errorOccurred = true;
        try {
            await unlink(tempFilePath);
        } catch (unlinkError: any) {
            if (unlinkError.code !== 'ENOENT') {
                console.error(`Error deleting temporary file ${tempFilePath} during error handling:`, unlinkError);
            }
        }
        throw scriptExecError; // Re-throw
    }

    if (!parsedData) {
      errorOccurred = true;
      throw new Error('Failed to parse QR data (Python script returned no data or JSON was invalid)');
    }

    // Log successful QR scan only if no error occurred
    if (!errorOccurred && userName) { // Ensure userName is defined
        try {
          await logSuccessfulQr({
            timestamp: new Date(),
            user_name: userName // Use outer-scoped userName
          });
        } catch (logError) {
          console.error("Error logging successful QR:", logError);
        }
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
      message: 'Aadhaar data processed successfully via Python script'
    });

  } catch (error: unknown) {
    console.error('API error:', error);

    // Final cleanup attempt in outer catch
    try {
        await unlink(tempFilePath);
    } catch (unlinkError: any) {
        if (unlinkError.code !== 'ENOENT') {
            console.error(`Error deleting temporary file ${tempFilePath} during final error handling:`, unlinkError);
        }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error processing request';
    
    // Log failed QR scan if it wasn't logged during script execution failure
    if (!errorOccurred) {
        try {
          // Use the outer-scoped userName, defaulting to 'unknown' if it was never assigned
          const finalUserName = userName || 'unknown'; 

          await logFailedQr({
            qr_details: 'Failed to process QR data via Python script',
            error_message: errorMessage,
            timestamp: new Date(),
            user_name: finalUserName 
          });
        } catch (logError) {
          console.error("Error logging failed QR:", logError);
        }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}