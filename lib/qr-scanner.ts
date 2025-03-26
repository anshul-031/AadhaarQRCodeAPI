import { BrowserQRCodeReader } from '@zxing/browser';
import jsQR from 'jsqr';

async function preprocessImageData(img: HTMLImageElement): Promise<{ imageData: ImageData, canvas: HTMLCanvasElement }[]> {
  console.log('Preprocessing image:', img.width, 'x', img.height);
  const results: { imageData: ImageData, canvas: HTMLCanvasElement }[] = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    console.error('Failed to get canvas context');
    return results;
  }

  const scales = [1, 1.5, 0.75];
  const rotations = [0, 90, 180, 270];

  for (const scale of scales) {
    const width = Math.floor(img.width * scale);
    const height = Math.floor(img.height * scale);

    canvas.width = width;
    canvas.height = height;

    for (const rotation of rotations) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width/2, height/2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -width/2, -height/2, width, height);
      ctx.restore();

      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        results.push({ imageData, canvas: canvas.cloneNode(true) as HTMLCanvasElement });
      } catch (e) {
        console.error('Error getting image data:', e);
      }

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
      console.log('Raw QR data:', code.data.substring(0, 50) + '...');
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
      console.log('Raw QR data:', result.getText().substring(0, 50) + '...');
      return result.getText();
    }
  } catch (e) {
    console.error('ZXing detection error:', e);
  }
  
  return null;
}

export async function extractQrFromImage(input: string): Promise<string> {
  console.log('Starting QR extraction from image');
  try {
    let qrData: string | null = null;

    // If input is already QR data (not an image), return it as is
    if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
      console.log('Input is raw QR data, returning as is');
      return input;
    }

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
        qrData = await detectQRCodeWithJsQR(variation.imageData);
        if (qrData) break;
        
        qrData = await detectQRCodeWithZXing(variation.canvas);
        if (qrData) break;
      }
    }

    if (!qrData) {
      throw new Error('Could not detect QR code in image. Please ensure the image is clear and properly cropped around the QR code.');
    }

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
    const codeReader = new BrowserQRCodeReader();
    console.log('Attempting to decode QR from video');
    const result = await codeReader.decodeOnceFromVideoElement(videoElement);
    const qrData = result.getText();
    console.log('Successfully decoded QR from video:', qrData.substring(0, 50) + '...');
    return qrData;
  } catch (e) {
    console.error('Error scanning QR from video:', e);
    throw e;
  }
}