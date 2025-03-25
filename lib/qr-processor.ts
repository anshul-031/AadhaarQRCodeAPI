import { Buffer } from 'buffer';
import pako from 'pako';
import { BrowserQRCodeReader } from '@zxing/browser';
import jsQR from 'jsqr';

export interface AadhaarData {
  name: string;
  gender: string;
  dob: string;
  address: string;
  photo?: string | null;
  issued_date: string;
  issued_time: string;
  mobile_number: string;
  uid?: string;
}

function toUint8ClampedArray(arr: Uint8Array): Uint8ClampedArray {
  return new Uint8ClampedArray(arr.buffer);
}

async function preprocessImageData(img: HTMLImageElement): Promise<{ imageData: ImageData, canvas: HTMLCanvasElement }[]> {
  console.log('Preprocessing image:', img.width, 'x', img.height);
  const results: { imageData: ImageData, canvas: HTMLCanvasElement }[] = [];
  
  // Create canvas with willReadFrequently
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    console.error('Failed to get canvas context');
    return results;
  }

  // Try different scales
  const scales = [1, 1.5, 0.75];
  const rotations = [0, 90, 180, 270];

  for (const scale of scales) {
    // Calculate new dimensions
    const width = Math.floor(img.width * scale);
    const height = Math.floor(img.height * scale);

    canvas.width = width;
    canvas.height = height;

    for (const rotation of rotations) {
      // Clear canvas and set up rotation
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width/2, height/2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -width/2, -height/2, width, height);
      ctx.restore();

      // Get regular image data
      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        results.push({ imageData, canvas: canvas.cloneNode(true) as HTMLCanvasElement });
      } catch (e) {
        console.error('Error getting image data:', e);
      }

      // Try with enhanced contrast
      try {
        const contrastData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < contrastData.data.length; i += 4) {
          const avg = (contrastData.data[i] + contrastData.data[i + 1] + contrastData.data[i + 2]) / 3;
          const val = avg < 128 ? 0 : 255;
          contrastData.data[i] = val;
          contrastData.data[i + 1] = val;
          contrastData.data[i + 2] = val;
        }
        results.push({ imageData: contrastData, canvas: canvas.cloneNode(true) as HTMLCanvasElement });
      } catch (e) {
        console.error('Error enhancing contrast:', e);
      }

      // Try with inverted colors
      try {
        const invertedData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < invertedData.data.length; i += 4) {
          invertedData.data[i] = 255 - invertedData.data[i];
          invertedData.data[i + 1] = 255 - invertedData.data[i + 1];
          invertedData.data[i + 2] = 255 - invertedData.data[i + 2];
        }
        results.push({ imageData: invertedData, canvas: canvas.cloneNode(true) as HTMLCanvasElement });
      } catch (e) {
        console.error('Error inverting colors:', e);
      }
    }
  }

  console.log(`Generated ${results.length} image variations`);
  return results;
}

async function detectQRCodeWithJsQR(imageData: ImageData): Promise<string | null> {
  console.log('Attempting to detect QR code with jsQR:', imageData.width, 'x', imageData.height);
  try {
    const code = jsQR(
      new Uint8ClampedArray(imageData.data.buffer),
      imageData.width,
      imageData.height,
      {
        inversionAttempts: "attemptBoth"
      }
    );
    
    if (code) {
      console.log('jsQR successfully detected QR code');
      console.log('QR Data preview:', code.data.substring(0, 50) + '...');
      return code.data;
    }
    return null;
  } catch (e) {
    console.error('jsQR detection error:', e);
    return null;
  }
}

async function detectQRCodeWithZXing(element: HTMLImageElement | HTMLCanvasElement): Promise<string | null> {
  console.log('Attempting to detect QR code with ZXing');
  const codeReader = new BrowserQRCodeReader();
  
  try {
    let result;
    if (element instanceof HTMLCanvasElement) {
      result = await codeReader.decodeFromCanvas(element);
    } else {
      result = await codeReader.decodeFromImageElement(element);
    }
    
    if (result) {
      console.log('ZXing successfully detected QR code');
      console.log('QR Data preview:', result.getText().substring(0, 50) + '...');
      return result.getText();
    }
  } catch (e) {
    console.error('ZXing detection error:', e);
  }
  
  return null;
}

// Process QR data from image or text
export async function processQrData(input: string): Promise<AadhaarData | null> {
  console.log('Starting QR data processing');
  try {
    let qrData: string | null = null;

    // Check if input is an image (base64)
    if (input.startsWith('data:image') || input.startsWith('iVBOR')) {
      console.log('Input is an image, attempting to decode QR code');
      
      // Create an image element from base64
      const img = document.createElement('img');
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
      });
      console.log('Image loaded successfully:', img.width, 'x', img.height);

      // Try original image first
      qrData = await detectQRCodeWithZXing(img);
      
      if (!qrData) {
        // Try preprocessed variations
        const variations = await preprocessImageData(img);
        console.log(`Trying ${variations.length} different image variations`);
        
        for (const variation of variations) {
          // Try jsQR first
          qrData = await detectQRCodeWithJsQR(variation.imageData);
          if (qrData) break;
          
          // Try ZXing with canvas
          qrData = await detectQRCodeWithZXing(variation.canvas);
          if (qrData) break;
        }
      }

      if (!qrData) {
        throw new Error('Could not detect QR code in image. Please ensure the image is clear and properly cropped around the QR code.');
      }
    } else {
      console.log('Input is raw QR data');
      qrData = input;
    }

    // Parse QR data
    if (qrData.startsWith('<?xml') || qrData.startsWith('<QPD')) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(qrData, 'text/xml');
      const root = xmlDoc.documentElement;

      if (qrData.startsWith('<?xml')) {
        return {
          name: root.getAttribute('name') || '',
          gender: root.getAttribute('gender') || '',
          dob: root.getAttribute('dob') || '',
          address: [
            root.getAttribute('co'),
            root.getAttribute('lm'),
            root.getAttribute('loc'),
            root.getAttribute('vtc'),
            root.getAttribute('dist'),
            root.getAttribute('state'),
            root.getAttribute('pc'),
          ].filter(Boolean).join(', '),
          uid: root.getAttribute('uid') || '',
          photo: null,
          issued_date: '',
          issued_time: '',
          mobile_number: ''
        };
      } else {
        return {
          name: root.getAttribute('n') || '',
          gender: root.getAttribute('g') || '',
          dob: root.getAttribute('d') || '',
          address: root.getAttribute('a') || '',
          photo: root.getAttribute('i') || null,
          uid: root.getAttribute('u') || '',
          issued_date: '',
          issued_time: '',
          mobile_number: root.getAttribute('m') || ''
        };
      }
    }

    // Process secure QR format
    console.log('Processing secure QR format');
    try {
      const byteArray = convertBase10ToBytes(qrData);
      const decompressed = pako.inflate(byteArray);
      const decodedText = new TextDecoder('iso-8859-1').decode(decompressed);
      console.log('Decompressed text preview:', decodedText.substring(0, 50) + '...');

      // Parse fields
      const fields = decodedText.split('ÿ');
      const dateMatch = fields.find(f => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/.test(f));
      
      if (!dateMatch) {
        throw new Error('Invalid QR code format - no date field found');
      }

      const dateIndex = fields.indexOf(dateMatch);
      const data: AadhaarData = {
        name: fields[dateIndex - 1] || '',
        gender: fields[dateIndex + 1] || '',
        dob: fields[dateIndex] || '',
        address: [
          fields[dateIndex + 2],
          fields[dateIndex + 3],
          fields[dateIndex + 4],
          fields[dateIndex + 5]
        ].filter(Boolean).join(', '),
        uid: fields[dateIndex - 2] ? 'xxxxxxxx' + fields[dateIndex - 2].slice(-4) : '',
        issued_date: '',
        issued_time: '',
        mobile_number: fields[dateIndex + 13] || '',
        photo: null
      };

      return data;
    } catch (e) {
      console.error('Failed to process as secure QR:', e);
      throw new Error('Invalid QR code format');
    }
  } catch (e) {
    console.error('Error processing QR data:', e);
    throw e;
  }
}

// Real-time video QR scanning
export async function scanQrFromVideo(videoElement: HTMLVideoElement): Promise<AadhaarData | null> {
  console.log('Starting video QR scan');
  try {
    const codeReader = new BrowserQRCodeReader();
    console.log('Attempting to decode QR from video');
    const result = await codeReader.decodeOnceFromVideoElement(videoElement);
    const qrData = result.getText();
    console.log('Successfully decoded QR from video');
    return await processQrData(qrData);
  } catch (e) {
    console.error('Error scanning QR from video:', e);
    return null;
  }
}

// Helper function to convert base10 string to byte array
function convertBase10ToBytes(qrData: string): Uint8Array {
  console.log('Converting base10 to bytes');
  try {
    const bigInt = BigInt(qrData);
    const hex = bigInt.toString(16);
    const paddedHex = hex.length % 2 ? '0' + hex : hex;
    const bytes = [];
    for (let i = 0; i < paddedHex.length; i += 2) {
      bytes.push(parseInt(paddedHex.slice(i, i + 2), 16));
    }
    console.log('Successfully converted to bytes, length:', bytes.length);
    return new Uint8Array(bytes);
  } catch (e) {
    console.error('Failed to convert base10:', e);
    throw new Error('Invalid QR data format');
  }
}