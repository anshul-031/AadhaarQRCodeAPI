import { NextRequest, NextResponse } from 'next/server';
import { logFailedQr, logSuccessfulQr } from '@/lib/db';
import { parseAadhaarQr } from '@/lib/aadhaar-processor';

interface RequestBody {
  qrData: string;
  userName: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RequestBody;
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

    // Log the raw QR data for debugging
    console.log('Received QR data:', qrData.substring(0, 100) + '...');

    // Parse the QR data on the backend
    const parsedData = await parseAadhaarQr(qrData);

    if (!parsedData) {
      throw new Error('Failed to parse QR data');
    }

    // Log successful QR scan (optional)
    try {
      await logSuccessfulQr({
        timestamp: new Date(),
        user_name: userName
      });
    } catch (logError) {
      console.error("Error logging successful QR:", logError);
      // Continue without failing the request
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
      message: 'Aadhaar data processed successfully'
    });

  } catch (error: unknown) {
    console.error('API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorBody = await request.json().catch(() => ({})) as Partial<RequestBody>;

    // Log failed QR scan (optional)
    try {
      await logFailedQr({
        qr_details: 'Failed to process QR data',
        error_message: errorMessage,
        timestamp: new Date(),
        user_name: errorBody?.userName || 'unknown'
      });
    } catch (logError) {
      console.error("Error logging failed QR:", logError);
      // Continue without failing the request further
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}