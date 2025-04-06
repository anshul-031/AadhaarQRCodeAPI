import { BrowserQRCodeReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import jsQR from 'jsqr';

interface DetectionResult {
  method: string;
  scale?: number;
  rotation?: number;
  threshold?: number;
  contrast?: number;  // Contrast factor used
  inverted?: boolean; // Whether the image was inverted
  sharpen?: boolean;  // Whether sharpening was applied
  success: boolean;
}

// Interface for parameters of image variations
interface VariationParams {
 scale: number;
 rotation: number;
 threshold?: number; // Binarization threshold (undefined for original/contrasted/inverted)
 contrast?: number;  // Contrast factor (undefined for original/binarized/inverted)
 inverted?: boolean; // True if inverted
 sharpen?: boolean;  // True if sharpened
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

function adjustContrast(imageData: ImageData, factor: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const newImageData = new ImageData(data, width, height);

  // We'll use a simpler factor approach: value = factor * (value - 128) + 128
  const contrastFactor = factor;

  for (let i = 0; i < data.length; i += 4) { // Loop starts
    // Apply contrast factor to R, G, B
    data[i] = Math.max(0, Math.min(255, contrastFactor * (data[i] - 128) + 128)); // Red
    data[i + 1] = Math.max(0, Math.min(255, contrastFactor * (data[i + 1] - 128) + 128)); // Green
    data[i + 2] = Math.max(0, Math.min(255, contrastFactor * (data[i + 2] - 128) + 128)); // Blue
  } // Loop ends
  return newImageData; // Return AFTER loop
}

// Basic 3x3 sharpening kernel
const sharpeningKernel = [
  [ 0, -1,  0],
  [-1,  5, -1],
  [ 0, -1,  0]
];

// Function to apply a convolution kernel (used for sharpening)
function applyConvolution(imageData: ImageData, kernel: number[][]): ImageData {
  const srcData = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const src = new Uint8ClampedArray(srcData); // Copy source data
  const dst = new Uint8ClampedArray(srcData.length);
  const kernelSize = kernel.length;
  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const imgY = Math.min(height - 1, Math.max(0, y + ky - halfKernel));
          const imgX = Math.min(width - 1, Math.max(0, x + kx - halfKernel));
          const weight = kernel[ky][kx];
          const offset = (imgY * width + imgX) * 4;
          r += src[offset] * weight;
          g += src[offset + 1] * weight;
          b += src[offset + 2] * weight;
        }
      }
      const dstOffset = (y * width + x) * 4;
      dst[dstOffset] = Math.max(0, Math.min(255, r));
      dst[dstOffset + 1] = Math.max(0, Math.min(255, g));
      dst[dstOffset + 2] = Math.max(0, Math.min(255, b));
      dst[dstOffset + 3] = src[dstOffset + 3]; // Keep alpha
    }
  }
  return new ImageData(dst, width, height);
}

function sharpenImageData(imageData: ImageData): ImageData {
    return applyConvolution(imageData, sharpeningKernel);
}


// Type for the result of preprocessImageData
type ProcessedVariation = {
  imageData: ImageData;
  canvas: HTMLCanvasElement;
  params: VariationParams;
};

// Helper function to generate binarized and inverted versions for a given image data
function generateSubVariations(
  imageData: ImageData,
  canvas: HTMLCanvasElement,
  params: VariationParams,
  thresholds: number[],
  results: ProcessedVariation[]
) {
  const width = imageData.width;
  const height = imageData.height;

  // Add the base image itself (original, contrasted, or sharpened)
  results.push({ imageData, canvas, params });

  // Add binarized versions
  for (const threshold of thresholds) {
    const binarizedData = binarizeImageData(imageData, threshold);
    const binarizedCanvas = document.createElement('canvas');
    binarizedCanvas.width = width;
    binarizedCanvas.height = height;
    const binarizedCtx = binarizedCanvas.getContext('2d');
    if (binarizedCtx) {
      binarizedCtx.putImageData(binarizedData, 0, 0);
      results.push({
        imageData: binarizedData,
        canvas: binarizedCanvas,
        params: { ...params, threshold }
      });
    }
  }

  // Add inverted version
  const invertedData = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  for (let i = 0; i < invertedData.data.length; i += 4) {
    invertedData.data[i] = 255 - invertedData.data[i];
    invertedData.data[i + 1] = 255 - invertedData.data[i + 1];
    invertedData.data[i + 2] = 255 - invertedData.data[i + 2];
  }
  const invertedCanvas = document.createElement('canvas');
  invertedCanvas.width = width;
  invertedCanvas.height = height;
  const invertedCtx = invertedCanvas.getContext('2d');
  if (invertedCtx) {
    invertedCtx.putImageData(invertedData, 0, 0);
    results.push({
      imageData: invertedData,
      canvas: invertedCanvas,
      params: { ...params, inverted: true }
    });
  }
}


// Helper function to add variations including sharpening
function addVariations(
  baseImageData: ImageData,
  baseCanvas: HTMLCanvasElement,
  baseParams: { scale: number, rotation: number, contrast?: number },
  thresholds: number[],
  results: ProcessedVariation[]
) {
  // Generate variations for the non-sharpened base image
  generateSubVariations(baseImageData, baseCanvas, baseParams, thresholds, results);

  // Generate variations for the sharpened base image
  try {
    const sharpenedImageData = sharpenImageData(baseImageData);
    const sharpenedCanvas = document.createElement('canvas');
    sharpenedCanvas.width = baseImageData.width;
    sharpenedCanvas.height = baseImageData.height;
    const sharpenedCtx = sharpenedCanvas.getContext('2d');
    if (sharpenedCtx) {
      sharpenedCtx.putImageData(sharpenedImageData, 0, 0);
      generateSubVariations(sharpenedImageData, sharpenedCanvas, { ...baseParams, sharpen: true }, thresholds, results);
    }
  } catch (e) {
      console.error("Error applying sharpening:", e);
  }
}


async function preprocessImageData(img: HTMLImageElement): Promise<ProcessedVariation[]> {
  console.log('Preprocessing image:', img.width, 'x', img.height);
  const results: ProcessedVariation[] = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    console.error('Failed to get canvas context');
    return results;
  }

  const scales = [1, 0.5, 2, 0.75, 1.5];
  const rotations = [0, 90, 180, 270];
  const thresholds = [128, 100, 150, 180];
  const contrastFactors = [1.5, 2.0]; // Moderate and High contrast increase

  for (const scale of scales) {
    const width = Math.floor(img.width * scale);
    const height = Math.floor(img.height * scale);

    if (width <= 0 || height <= 0) continue;

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
        // --- Process Original Contrast ---
        const originalImageData = ctx.getImageData(0, 0, width, height);
        // Pass the original canvas for this set of variations
        const originalCanvasClone = canvas.cloneNode(true) as HTMLCanvasElement;
        addVariations(originalImageData, originalCanvasClone, { scale, rotation }, thresholds, results);

        // --- Process Increased Contrast ---
        for (const factor of contrastFactors) {
          const contrastedImageData = adjustContrast(originalImageData, factor);
          const contrastedCanvas = document.createElement('canvas');
          contrastedCanvas.width = width;
          contrastedCanvas.height = height;
          const contrastedCtx = contrastedCanvas.getContext('2d');
          if (contrastedCtx) {
            contrastedCtx.putImageData(contrastedImageData, 0, 0);
            addVariations(contrastedImageData, contrastedCanvas, { scale, rotation, contrast: factor }, thresholds, results);
          }
        }

      } catch (e) {
        if (e instanceof DOMException && e.name === 'SecurityError') {
          console.warn(`SecurityError processing variation (Scale=${scale}, Rotation=${rotation}). Skipping.`);
        } else {
          console.error(`Error processing image variation (Scale=${scale}, Rotation=${rotation}):`, e);
        }
      }
    }
  }

  console.log(`Generated ${results.length} image variations (incl. contrast/sharpening adjustments)`);
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
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  const codeReader = new BrowserQRCodeReader(hints);
  
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
    // Reduce noise for common ZXing errors
    if (!(e instanceof Error && e.name === 'NotFoundException')) {
       console.error('ZXing detection error:', e);
    }
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

    // Generate and try all variations (including contrast/sharpening)
    const variations = await preprocessImageData(img);
    
    // Try jsQR on all variations
    for (const variation of variations) {
      const jsqrResult = await detectQRCodeWithJsQR(variation.imageData);
      results.push({
        method: 'jsQR',
        scale: variation.params.scale,
        rotation: variation.params.rotation,
        threshold: variation.params.threshold,
        contrast: variation.params.contrast,
        inverted: variation.params.inverted,
        sharpen: variation.params.sharpen,
        success: jsqrResult !== null
      });
    }

    // Only try ZXing if jsQR failed to find any results
    if (!results.some(r => r.success)) {
      // Try ZXing on all variations
      for (const variation of variations) {
         const zxingVariationResult = await detectQRCodeWithZXing(variation.canvas);
         results.push({
           method: 'ZXing',
           scale: variation.params.scale,
           rotation: variation.params.rotation,
           threshold: variation.params.threshold,
           contrast: variation.params.contrast,
           inverted: variation.params.inverted,
           sharpen: variation.params.sharpen,
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

    // --- Detection Strategy ---
    // 1. Try jsQR on original image (often faster)
    console.log('Attempt 1: jsQR on original image');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);
      try {
        const originalImageData = ctx.getImageData(0, 0, img.width, img.height);
        qrData = await detectQRCodeWithJsQR(originalImageData);
        if (qrData) {
          console.log('Success: QR extracted using jsQR on original image.');
        }
      } catch (e) {
        console.warn('Could not get ImageData for jsQR:', e);
      }
    } else {
      console.warn('Could not get canvas context for jsQR');
    }


    // 2. Try ZXing (with TRY_HARDER) on original image
    if (!qrData) {
      console.log('Attempt 2: ZXing (TRY_HARDER) on original image');
      qrData = await detectQRCodeWithZXing(img);
      if (qrData) {
        console.log('Success: QR extracted using ZXing (TRY_HARDER) on original image.');
      }
    }

    // 3. If still not found, generate variations and try jsQR
    if (!qrData) {
      console.log('Attempt 3: Generating variations for jsQR');
      const variations = await preprocessImageData(img);
      console.log(`Processing ${variations.length} variations with jsQR in parallel`);
      const jsQRResult = await processInParallel(
        variations,
        (variation) => detectQRCodeWithJsQR(variation.imageData)
      );
      
      if (jsQRResult) {
        qrData = jsQRResult.result;
        const params = variations[jsQRResult.index].params;
        console.log(`Success: QR extracted using jsQR on variation ${jsQRResult.index}: Scale=${params.scale}, Rotation=${params.rotation}, Threshold=${params.threshold ?? 'N/A'}, Contrast=${params.contrast ?? 'Original'}, Inverted=${params.inverted ?? false}, Sharpen=${params.sharpen ?? false}`);
      }
    }

    // 4. If still not found, try ZXing (with TRY_HARDER) on variations
    if (!qrData) {
      console.log('Attempt 4: Trying variations with ZXing (TRY_HARDER)');
      // Re-use variations if already generated, otherwise generate them
      // Note: This assumes variations are needed, might need regeneration if context lost
      const variations = await preprocessImageData(img); // Regenerate just in case
      console.log(`Processing ${variations.length} variations with ZXing (TRY_HARDER) in parallel`);
      const zxingResult = await processInParallel(
        variations,
        (variation) => detectQRCodeWithZXing(variation.canvas)
      );
      
      if (zxingResult) {
        qrData = zxingResult.result;
        const params = variations[zxingResult.index].params;
        console.log(`Success: QR extracted using ZXing (TRY_HARDER) on variation ${zxingResult.index}: Scale=${params.scale}, Rotation=${params.rotation}, Threshold=${params.threshold ?? 'N/A'}, Contrast=${params.contrast ?? 'Original'}, Inverted=${params.inverted ?? false}, Sharpen=${params.sharpen ?? false}`);
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