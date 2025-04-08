// Import existing libraries
import { BrowserQRCodeReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import jsQR from 'jsqr';

// Import Dynamsoft configuration (this ensures the license is initialized)
import './dynamsoft-config'; // Make sure this path is correct relative to qr-scanner.ts

// Import Dynamsoft modules
import { CaptureVisionRouter } from "dynamsoft-capture-vision-router";
import { BarcodeResultItem, EnumBarcodeFormat } from "dynamsoft-barcode-reader";
import { EnumCapturedResultItemType } from "dynamsoft-core";

// --- Keep existing interfaces and helper functions for fallback ---
interface DetectionResult {
  method: string;
  scale?: number;
  rotation?: number;
  threshold?: number;
  contrast?: number;
  inverted?: boolean;
  sharpen?: boolean;
  success: boolean;
}

interface VariationParams {
 scale: number;
 rotation: number;
 threshold?: number;
 contrast?: number;
 inverted?: boolean;
 sharpen?: boolean;
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
  const contrastFactor = factor;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, contrastFactor * (data[i] - 128) + 128));
    data[i + 1] = Math.max(0, Math.min(255, contrastFactor * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.max(0, Math.min(255, contrastFactor * (data[i + 2] - 128) + 128));
  }
  return newImageData;
}

const sharpeningKernel = [
  [ 0, -1,  0],
  [-1,  5, -1],
  [ 0, -1,  0]
];

function applyConvolution(imageData: ImageData, kernel: number[][]): ImageData {
  const srcData = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const src = new Uint8ClampedArray(srcData);
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
      dst[dstOffset + 3] = src[dstOffset + 3];
    }
  }
  return new ImageData(dst, width, height);
}

function sharpenImageData(imageData: ImageData): ImageData {
    return applyConvolution(imageData, sharpeningKernel);
}

type ProcessedVariation = {
  imageData: ImageData;
  canvas: HTMLCanvasElement;
  params: VariationParams;
};

function generateSubVariations(
  imageData: ImageData,
  canvas: HTMLCanvasElement,
  params: VariationParams,
  thresholds: number[],
  results: ProcessedVariation[]
) {
  const width = imageData.width;
  const height = imageData.height;
  results.push({ imageData, canvas, params });
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

function addVariations(
  baseImageData: ImageData,
  baseCanvas: HTMLCanvasElement,
  baseParams: { scale: number, rotation: number, contrast?: number },
  thresholds: number[],
  results: ProcessedVariation[]
) {
  generateSubVariations(baseImageData, baseCanvas, baseParams, thresholds, results);
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
  const contrastFactors = [1.5, 2.0];
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
        const originalImageData = ctx.getImageData(0, 0, width, height);
        const originalCanvasClone = canvas.cloneNode(true) as HTMLCanvasElement;
        addVariations(originalImageData, originalCanvasClone, { scale, rotation }, thresholds, results);
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
      { inversionAttempts: "attemptBoth" }
    );
    if (code) return code.data;
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
    if (result) return result.getText();
  } catch (e) {
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
  const chunkSize = 5;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const processingPromises = chunk.map((item, chunkIndex) =>
      processor(item).then(result => ({ result, index: i + chunkIndex }))
    );
    const results = await Promise.all(processingPromises);
    const validResult = results.find(r => r.result !== null);
    if (validResult && validResult.result) {
      return { result: validResult.result, index: validResult.index };
    }
  }
  return null;
}

// --- New Dynamsoft Detection Function ---
let cvRouterInstance: CaptureVisionRouter | null = null;
let cvRouterPromise: Promise<CaptureVisionRouter> | null = null;

async function getDynamsoftRouter(): Promise<CaptureVisionRouter> {
  if (cvRouterInstance) {
    return cvRouterInstance;
  }
  if (!cvRouterPromise) {
    console.log("Creating Dynamsoft CaptureVisionRouter instance...");
    cvRouterPromise = CaptureVisionRouter.createInstance();
    try {
      cvRouterInstance = await cvRouterPromise;
      console.log("Dynamsoft CaptureVisionRouter instance created.");
      // Configure for QR codes, potentially optimizing for speed/accuracy
      // Using 'ReadBarcodes_SpeedFirst' or 'ReadBarcodes_ReadRateFirst' might be good starting points
      // Or define custom settings
      // Simplify settings: Use default templates or minimal overrides if needed.
      // For now, let's try initializing with minimal settings or even skip custom initSettings
      // if the default behavior is sufficient. Let's try skipping it first.
      // If issues persist, we can try a minimal initSettings like:
      /*
      await cvRouterInstance.initSettings({
          "CaptureVisionTemplates": [{ "Name": "Default" }], // Reference a potentially default template
          "TargetROIDefOptions": [], // Keep empty if using defaults
          "BarcodeReaderTaskSettingOptions": [] // Keep empty if using defaults
      });
      */
      // For now, assume default settings are okay after createInstance()
      console.log("Skipping custom initSettings, relying on Dynamsoft defaults.");
      console.log("Dynamsoft CaptureVisionRouter settings initialized.");
    } catch (error) {
      console.error("Failed to create or configure Dynamsoft Router:", error);
      cvRouterPromise = null; // Reset promise if creation failed
      throw error; // Re-throw the error
    }
  } else {
    // If promise exists but instance is not yet set, wait for it
    cvRouterInstance = await cvRouterPromise;
  }
  return cvRouterInstance;
}

async function detectQRCodeWithDynamsoft(input: string | HTMLImageElement | HTMLCanvasElement | Blob | File): Promise<string | null> {
  try {
    const cvRouter = await getDynamsoftRouter();
    let resultText: string | null = null;

    // Try templates in order: Speed -> Balance -> Accuracy
    // Use standard Dynamsoft template names known to work
    const templates = ["ReadBarcodes_SpeedFirst", "ReadBarcodes_ReadRateFirst", "ReadBarcodes_Balance"];

    for (const template of templates) {
        console.log(`Attempting Dynamsoft detection with template: ${template}`);
        const startTime = performance.now();
        const result = await cvRouter.capture(input, template);
        const endTime = performance.now();
        console.log(`Dynamsoft capture (${template}) took: ${(endTime - startTime).toFixed(2)} ms`);

        if (result.items.length > 0) {
            for (let item of result.items) {
                if (item.type === EnumCapturedResultItemType.CRIT_BARCODE) {
                    const barcodeItem = item as BarcodeResultItem;
                    // Check if it's a QR code (though template should filter)
                    if (barcodeItem.format === EnumBarcodeFormat.BF_QR_CODE) {
                        resultText = barcodeItem.text;
                        console.log(`Success: QR extracted using Dynamsoft (${template}).`);
                        break; // Found a QR code, stop trying templates
                    }
                }
            }
        }
        if (resultText) break; // Exit outer loop if found
    }

    return resultText;

  } catch (ex: any) {
    console.error('Dynamsoft detection error:', ex.message || ex);
    // Check for license errors specifically if possible (may need specific error codes/messages)
    if (ex.message && (ex.message.includes("License") || ex.message.includes("expired"))) {
        console.warn("Dynamsoft license error detected. Consider falling back.");
        // Potentially throw a specific error type or return a special value
        // to signal fallback in the calling function. For now, just return null.
    }
    return null;
  }
}

// --- Modified Extraction Function ---
export async function extractQrFromImage(input: string): Promise<string> {
  console.log('Starting QR extraction from image (Dynamsoft Primary)');
  let qrData: string | null = null;
  let errorOccurred: Error | null = null;

  // If input is already QR data (not an image), return it as is
  if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
    console.log('Input is raw QR data, returning as is');
    return input;
  }

  // --- Strategy ---
  // 1. Try Dynamsoft (handles base64/data URLs directly)
  console.log('Attempt 1: Dynamsoft');
  try {
    qrData = await detectQRCodeWithDynamsoft(input);
    if (qrData) {
      console.log('Success: QR extracted using Dynamsoft.');
    } else {
      console.log('Dynamsoft did not find a QR code.');
    }
  } catch (e: any) {
    console.error('Error during Dynamsoft detection attempt:', e);
    errorOccurred = e; // Store error for potential fallback decision
    // Check if it's a license issue or critical failure
    if (e.message && (e.message.includes("License") || e.message.includes("expired") || e.message.includes("Failed to create"))) {
        console.warn("Critical Dynamsoft error or license issue. Proceeding to fallback.");
    } else {
        // Non-critical error, maybe just didn't find QR. Fallback will run anyway if qrData is null.
    }
  }

  // 2. Fallback to original jsQR/ZXing logic if Dynamsoft failed
  if (!qrData) {
    console.log('Attempt 2: Fallback to jsQR/ZXing');
    try {
      const img = document.createElement('img');
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
      });
      console.log('Fallback: Image loaded successfully:', img.width, 'x', img.height);

      // 2a. Try jsQR on original
      console.log('Fallback Attempt 2a: jsQR on original image');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        try {
          const originalImageData = ctx.getImageData(0, 0, img.width, img.height);
          qrData = await detectQRCodeWithJsQR(originalImageData);
          if (qrData) console.log('Fallback Success: QR extracted using jsQR on original image.');
        } catch (e) { console.warn('Fallback: Could not get ImageData for jsQR:', e); }
      } else { console.warn('Fallback: Could not get canvas context for jsQR'); }

      // 2b. Try ZXing on original
      if (!qrData) {
        console.log('Fallback Attempt 2b: ZXing (TRY_HARDER) on original image');
        qrData = await detectQRCodeWithZXing(img);
        if (qrData) console.log('Fallback Success: QR extracted using ZXing (TRY_HARDER) on original image.');
      }

      // 2c. Generate variations and try jsQR
      if (!qrData) {
        console.log('Fallback Attempt 2c: Generating variations for jsQR');
        const variations = await preprocessImageData(img);
        console.log(`Fallback: Processing ${variations.length} variations with jsQR in parallel`);
        const jsQRResult = await processInParallel(variations, (v) => detectQRCodeWithJsQR(v.imageData));
        if (jsQRResult) {
          qrData = jsQRResult.result;
          const params = variations[jsQRResult.index].params;
          console.log(`Fallback Success: QR extracted using jsQR on variation ${jsQRResult.index}: Scale=${params.scale}, Rot=${params.rotation}, Thr=${params.threshold ?? 'N/A'}, Contr=${params.contrast ?? 'Orig'}, Inv=${params.inverted ?? false}, Sharp=${params.sharpen ?? false}`);
        }
      }

      // 2d. Try ZXing on variations
      if (!qrData) {
        console.log('Fallback Attempt 2d: Trying variations with ZXing (TRY_HARDER)');
        const variations = await preprocessImageData(img); // Regenerate just in case
        console.log(`Fallback: Processing ${variations.length} variations with ZXing (TRY_HARDER) in parallel`);
        const zxingResult = await processInParallel(variations, (v) => detectQRCodeWithZXing(v.canvas));
        if (zxingResult) {
          qrData = zxingResult.result;
          const params = variations[zxingResult.index].params;
          console.log(`Fallback Success: QR extracted using ZXing (TRY_HARDER) on variation ${zxingResult.index}: Scale=${params.scale}, Rot=${params.rotation}, Thr=${params.threshold ?? 'N/A'}, Contr=${params.contrast ?? 'Orig'}, Inv=${params.inverted ?? false}, Sharp=${params.sharpen ?? false}`);
        }
      }
    } catch (fallbackError: any) {
        console.error('Error during fallback QR extraction:', fallbackError);
        // If Dynamsoft also failed, throw the original error or a combined one
        if (errorOccurred) {
            throw new Error(`Primary (Dynamsoft) failed: ${errorOccurred.message}. Fallback also failed: ${fallbackError.message}`);
        } else {
            throw fallbackError; // Throw the fallback error
        }
    }
  } // End of fallback logic

  if (!qrData) {
    // If we reach here, neither Dynamsoft nor the fallback found a QR code
    const finalError = errorOccurred ? `Primary attempt failed (${errorOccurred.message}) and fallback failed.` : 'Could not detect QR code in image using any method.';
    console.error(finalError);
    throw new Error('Could not detect QR code in image. Please ensure the image is clear and properly cropped around the QR code.');
  }

  console.log('Successfully extracted QR data:', qrData.substring(0, 50) + '...');
  return qrData;
}


// --- Keep existing analyzeQRDetectionMethods and extractQrFromVideo ---
// Note: analyzeQRDetectionMethods might need updating if you want to include Dynamsoft results
export async function analyzeQRDetectionMethods(input: string): Promise<DetectionResult[]> {
  // This function currently only analyzes jsQR and ZXing variations.
  // TODO: Optionally integrate Dynamsoft analysis here if needed.
  console.warn("analyzeQRDetectionMethods currently does not include Dynamsoft results.");
  const results: DetectionResult[] = [];
  try {
    const img = document.createElement('img');
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    });
    const zxingResult = await detectQRCodeWithZXing(img);
    results.push({ method: 'ZXing-Original', success: zxingResult !== null });
    const variations = await preprocessImageData(img);
    for (const variation of variations) {
      const jsqrResult = await detectQRCodeWithJsQR(variation.imageData);
      results.push({
        method: 'jsQR', scale: variation.params.scale, rotation: variation.params.rotation,
        threshold: variation.params.threshold, contrast: variation.params.contrast,
        inverted: variation.params.inverted, sharpen: variation.params.sharpen,
        success: jsqrResult !== null
      });
    }
    if (!results.some(r => r.success)) {
      for (const variation of variations) {
         const zxingVariationResult = await detectQRCodeWithZXing(variation.canvas);
         results.push({
           method: 'ZXing', scale: variation.params.scale, rotation: variation.params.rotation,
           threshold: variation.params.threshold, contrast: variation.params.contrast,
           inverted: variation.params.inverted, sharpen: variation.params.sharpen,
           success: zxingVariationResult !== null
         });
      }
    }
  } catch (e) { console.error('Error during analysis:', e); }
  return results;
}

// Updated video function using ZXing with continuous scanning
export function extractQrFromVideo(videoElement: HTMLVideoElement): Promise<string> {
  console.log('Starting video QR scan (using ZXing)');
  const codeReader = new BrowserQRCodeReader();

  return new Promise<string>((resolve, reject) => {
    try {
      console.log('Attempting to decode QR from video stream continuously');
      codeReader.decodeFromVideoElement(videoElement, (result, err, controls) => {
        if (result) {
          console.log('Video scan result:', result.getText());
          // Stop scanning once a result is found
          controls.stop();
          resolve(result.getText());
        }
        if (err) {
          // Log errors but don't reject immediately unless it's critical
          // NotFoundException is common and expected until a QR code is found
          if (!(err instanceof Error && err.name === 'NotFoundException')) {
            console.error('Error during video scan:', err);
            // Optionally reject on specific errors, but often we want to keep trying
            // reject(err);
          }
        }
      });
      console.log('ZXing video scanning started.');
    } catch (e) {
      console.error('Error initiating QR extraction from video:', e);
      reject(e); // Reject the promise if setup fails
    }
  });
}