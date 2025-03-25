import { NextRequest, NextResponse } from 'next/server';
import { logFailedQr, logSuccessfulQr } from '@/lib/db';

interface RequestBody {
  parsedData: any;
  userName: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RequestBody;
    const { parsedData, userName } = body;

    if (!parsedData) {
      return NextResponse.json(
        { error: 'Parsed QR data is required' },
        { status: 400 }
      );
    }

    if (!userName) {
      return NextResponse.json(
        { error: 'User name is required' },
        { status: 400 }
      );
    }

    // Log successful QR scan
    await logSuccessfulQr({
      timestamp: new Date(),
      user_name: userName
    });

    return NextResponse.json({
      success: true,
      data: parsedData,
      message: 'Aadhaar data logged successfully'
    });

  } catch (error) {
    console.error('API error:', error);
    const errorBody = await request.json().catch(() => ({})) as Partial<RequestBody>;
    
    await logFailedQr({
      qr_details: 'Client-side parsing error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
      user_name: errorBody?.userName || 'unknown'
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}