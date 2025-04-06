import { BrowserQRCodeReader } from '@zxing/browser';
import jsQR from 'jsqr';

interface DetectionResult {
  method: string;
  scale?: number;
  rotation?: number;
  threshold?: number;
  success: boolean;
}

function binarizeImageData(imageData: ImageData, threshold: number): ImageData {
  const newImageData = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
  
  for (let i = 0; i < newImageData.data.length; i += 4) {
    const avg = (newImageData.data[i] + newImageData.data[i + 1] + newImageData.data[i + 2]) / 3;
    const val = avg < threshold ? 0 : 255;
    newImageData.data[i] = val;
    newImageData.data[i + 1] = val;
    newImageData.data[i + 2] = val;
  }
  
  return newImageData;
}

async function preprocessImageData(img: HTMLImageElement): Promise<{ imageData: ImageData, canvas: HTMLCanvasElement, params: { scale: number, rotation: number, threshold?: number } }[]> {
  console.log('Preprocessing image:', img.width, 'x', img.height);
  const results: { imageData: ImageData, canvas: HTMLCanvasElement, params: { scale: number, rotation: number, threshold?: number } }[] = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    console.error('Failed to get canvas context');
    return results;
  }

  // Prioritized scaling factors based on test results
  const scales = [1, 0.5, 2, 0.75, 1.5];
  const rotations = [0, 90, 180, 270];
  const thresholds = [128, 100, 150, 180]; // Prioritize standard threshold

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
        // Original image data
        const imageData = ctx.getImageData(0, 0, width, height);
        results.push({ 
          imageData, 
          canvas: canvas.cloneNode(true) as HTMLCanvasElement,
          params: { scale, rotation }
        });

        // Multiple threshold binarization
        for (const threshold of thresholds) {
          const binarizedData = binarizeImageData(imageData, threshold);
          results.push({ 
            imageData: binarizedData, 
            canvas: canvas.cloneNode(true) as HTMLCanvasElement,
            params: { scale, rotation, threshold }
          });
        }

        // Inverted image
        const invertedData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < invertedData.data.length; i += 4) {
          invertedData.data[i] = 255 - invertedData.data[i];
          invertedData.data[i + 1] = 255 - invertedData.data[i + 1];
          invertedData.data[i + 2] = 255 - invertedData.data[i + 2];
        }
        results.push({ 
          imageData: invertedData, 
          canvas: canvas.cloneNode(true) as HTMLCanvasElement,
          params: { scale, rotation, threshold: -1 }
        });
      } catch (e) {
        console.error('Error processing image variation:', e);
      }
    }
  }

  console.log(`Generated ${results.length} image variations`);
  return results;
}

async function detectQRCodeWithJsQR(imageData: ImageData): Promise<string | null> {
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
      return code.data;
    }
    return null;
  } catch (e) {
    console.error('jsQR detection error:', e);
    return null;
  }
}

async function detectQRCodeWithZXing(element: HTMLImageElement | HTMLCanvasElement): Promise<string | null> {
  const codeReader = new BrowserQRCodeReader();
  
  try {
    let result;
    if (element instanceof HTMLCanvasElement) {
      result = await codeReader.decodeFromCanvas(element);
    } else {
      result = await codeReader.decodeFromImageElement(element);
    }
    
    if (result) {
      return result.getText();
    }
  } catch (e) {
    console.error('ZXing detection error:', e);
  }
  
  return null;
}

async function processInParallel<T>(
  items: T[],
  processor: (item: T) => Promise<string | null>
): Promise<{ result: string, index: number } | null> {
  const chunkSize = 5; // Process 5 items at a time to avoid overwhelming
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    // Map processor calls to include the original index relative to the start of the chunk
    const processingPromises = chunk.map((item, chunkIndex) =>
      processor(item).then(result => ({ result, index: i + chunkIndex }))
    );
    
    const results = await Promise.all(processingPromises);
    
    // Find the first successful result in the chunk
    const validResult = results.find(r => r.result !== null);
    if (validResult && validResult.result) {
      // Ensure result is not null before returning
      return { result: validResult.result, index: validResult.index };
    }
  }
  
  return null;
}

export async function analyzeQRDetectionMethods(input: string): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  
  try {
    const img = document.createElement('img');
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    });

    // Try ZXing on original image
    const zxingResult = await detectQRCodeWithZXing(img);
    results.push({
      method: 'ZXing-Original',
      success: zxingResult !== null
    });

    // Generate and try all variations
    const variations = await preprocessImageData(img);
    
    // Try jsQR first since it's more reliable in Node environment
    for (const variation of variations) {
      const jsqrResult = await detectQRCodeWithJsQR(variation.imageData);
      if (jsqrResult !== null) {
        results.push({
          method: 'jsQR',
          scale: variation.params.scale,
          rotation: variation.params.rotation,
          threshold: variation.params.threshold,
          success: true
        });
      }
    }

    // Only try ZXing if jsQR failed to find any results
    if (!results.some(r => r.success)) {
      for (const variation of variations) {
        const zxingVariationResult = await detectQRCodeWithZXing(variation.canvas);
        results.push({
          method: 'ZXing',
          scale: variation.params.scale,
          rotation: variation.params.rotation,
          threshold: variation.params.threshold,
          success: zxingVariationResult !== null
        });
      }
    }

  } catch (e) {
    console.error('Error during analysis:', e);
  }

  return results;
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

    // Try original image first with jsQR since it's more reliable
    const imgData = new ImageData(img.width, img.height);
    qrData = await detectQRCodeWithJsQR(imgData);
    if (qrData) {
      console.log('QR extracted using jsQR on original image.');
    }
    
    if (!qrData) {
      // Try ZXing on original image
      qrData = await detectQRCodeWithZXing(img);
      if (qrData) {
        console.log('QR extracted using ZXing on original image.');
      }
      
      if (!qrData) {
        // Generate all variations
        const variations = await preprocessImageData(img);
        console.log(`Processing ${variations.length} different image variations in parallel`);
        
        // Try jsQR in parallel
        const jsQRResult = await processInParallel(
          variations,
          (variation) => detectQRCodeWithJsQR(variation.imageData)
        );
        
        if (jsQRResult) {
          qrData = jsQRResult.result;
          const params = variations[jsQRResult.index].params;
          console.log(`QR extracted using jsQR on variation ${jsQRResult.index}: Scale=${params.scale}, Rotation=${params.rotation}, Threshold=${params.threshold ?? 'N/A'}`);
        }
        
        // If jsQR failed, try ZXing in parallel
        if (!qrData) {
          const zxingResult = await processInParallel(
            variations,
            (variation) => detectQRCodeWithZXing(variation.canvas)
          );
          
          if (zxingResult) {
            qrData = zxingResult.result;
            const params = variations[zxingResult.index].params;
            console.log(`QR extracted using ZXing on variation ${zxingResult.index}: Scale=${params.scale}, Rotation=${params.rotation}, Threshold=${params.threshold ?? 'N/A'}`);
          }
        }
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