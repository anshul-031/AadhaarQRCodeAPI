declare global {
  interface Window {
    dynamsoft: any;
    Dynamsoft: any;
  }
}

// Initialize the reader instance
let barcodeReader: any = null;
let initPromise: Promise<void> | null = null;

async function waitForDynamsoft(): Promise<any> {
  const timeout = 30000; // 30 seconds timeout
  const startTime = Date.now();
  
  while (!window.Dynamsoft?.DBR?.BarcodeReader) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for Dynamsoft to initialize');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Wait for license to be properly set
  if (!window.dynamsoft?.dbrEnv?.licenseKey) {
    throw new Error('Dynamsoft license key not found');
  }
  
  return window.Dynamsoft.DBR.BarcodeReader;
}

async function initBarcodeReader() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        if (!barcodeReader) {
          // Wait for Dynamsoft to be fully loaded
          const BarcodeReader = await waitForDynamsoft();

          // Create instance (WASM will be loaded automatically)
          barcodeReader = await BarcodeReader.createInstance();

          // Use basic settings for QR code scanning
          await barcodeReader.updateRuntimeSettings("speed");
          
          // Adjust a few basic parameters
          const settings = await barcodeReader.getRuntimeSettings();
          settings.expectedBarcodesCount = 1;
          settings.timeout = 10000;
          await barcodeReader.updateRuntimeSettings(settings);

          console.log('Dynamsoft Barcode Reader initialized successfully');
        }
      } catch (ex) {
        console.error('Error initializing Dynamsoft Barcode Reader:', ex);
        initPromise = null;
        throw ex;
      }
    })();
  }
  await initPromise;
  return barcodeReader;
}

export async function extractQrFromImage(input: string): Promise<string> {
  console.log('Starting QR extraction from image');
  try {
    // If input is already QR data (not an image), return it as is
    if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
      console.log('Input is raw QR data, returning as is');
      return input;
    }

    const reader = await initBarcodeReader();
    if (!reader) {
      throw new Error('Failed to initialize barcode reader');
    }

    // Create an image object to decode
    const img = document.createElement('img');
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    });

    // Decode the image
    const results = await reader.decode(img);
    if (!results || results.length === 0) {
      throw new Error('Could not detect QR code in image. Please ensure the image is clear and properly cropped around the QR code.');
    }

    const qrData = results[0].barcodeText;
    console.log('Successfully extracted QR data:', qrData.substring(0, 50) + '...');
    return qrData;
  } catch (e) {
    console.error('Error extracting QR data:', e);
    throw e;
  }
}

export async function extractQrFromVideo(videoElement: HTMLVideoElement): Promise<string> {
  console.log('Starting video QR scan');
  try {
    const reader = await initBarcodeReader();
    if (!reader) {
      throw new Error('Failed to initialize barcode reader');
    }

    // Decode from video element
    const results = await reader.decode(videoElement);
    if (!results || results.length === 0) {
      throw new Error('No QR code detected in video frame');
    }

    const qrData = results[0].barcodeText;
    console.log('Successfully decoded QR from video:', qrData.substring(0, 50) + '...');
    return qrData;
  } catch (e) {
    console.error('Error scanning QR from video:', e);
    throw e;
  }
}

// Clean up function to release resources
export async function cleanup() {
  if (barcodeReader) {
    try {
      await barcodeReader.destroy();
      barcodeReader = null;
      initPromise = null;
    } catch (e) {
      console.error('Error during cleanup:', e);
    }
  }
}