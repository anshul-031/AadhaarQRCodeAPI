import { BrowserQRCodeReader } from '@zxing/browser';
import jsQR from 'jsqr';

async function preprocessImageData(img: HTMLImageElement): Promise<{ imageData: ImageData, canvas: HTMLCanvasElement }[]> {
  console.log('Starting image preprocessing');
  console.log('Input image dimensions:', img.width, 'x', img.height);
  const results: { imageData: ImageData, canvas: HTMLCanvasElement }[] = [];
  
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const scales = [1, 1.5, 0.75];
    const rotations = [0, 90, 180, 270];
    console.log('Processing with scales:', scales);
    console.log('Processing with rotations:', rotations);

    for (const scale of scales) {
      console.log(`\nProcessing scale: ${scale}`);
      const width = Math.floor(img.width * scale);
      const height = Math.floor(img.height * scale);
      console.log('Scaled dimensions:', width, 'x', height);

      canvas.width = width;
      canvas.height = height;

      for (const rotation of rotations) {
        console.log(`Processing rotation: ${rotation}°`);
        
        try {
          // Clear and prepare canvas
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          ctx.translate(width/2, height/2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -width/2, -height/2, width, height);
          ctx.restore();

          // Original version
          try {
            console.log('Creating original version...');
            const imageData = ctx.getImageData(0, 0, width, height);
            results.push({
              imageData,
              canvas: canvas.cloneNode(true) as HTMLCanvasElement
            });
            console.log('Original version created successfully');
          } catch (e) {
            console.error('Error creating original version:', e);
          }

          // High contrast version
          try {
            console.log('Creating high contrast version...');
            const contrastData = ctx.getImageData(0, 0, width, height);
            for (let i = 0; i < contrastData.data.length; i += 4) {
              const avg = (contrastData.data[i] + contrastData.data[i + 1] + contrastData.data[i + 2]) / 3;
              const val = avg < 128 ? 0 : 255;
              contrastData.data[i] = val;
              contrastData.data[i + 1] = val;
              contrastData.data[i + 2] = val;
            }
            results.push({
              imageData: contrastData,
              canvas: canvas.cloneNode(true) as HTMLCanvasElement
            });
            console.log('High contrast version created successfully');
          } catch (e) {
            console.error('Error creating high contrast version:', e);
          }

          // Inverted version
          try {
            console.log('Creating inverted version...');
            const invertedData = ctx.getImageData(0, 0, width, height);
            for (let i = 0; i < invertedData.data.length; i += 4) {
              invertedData.data[i] = 255 - invertedData.data[i];
              invertedData.data[i + 1] = 255 - invertedData.data[i + 1];
              invertedData.data[i + 2] = 255 - invertedData.data[i + 2];
            }
            results.push({
              imageData: invertedData,
              canvas: canvas.cloneNode(true) as HTMLCanvasElement
            });
            console.log('Inverted version created successfully');
          } catch (e) {
            console.error('Error creating inverted version:', e);
          }
        } catch (e) {
          console.error(`Error processing rotation ${rotation}°:`, e);
        }
      }
    }

    const totalVariations = results.length;
    console.log(`\nPreprocessing complete: Generated ${totalVariations} image variations`);
    console.log('Variations breakdown:',
      `\n- Original images: ${totalVariations / 3}`,
      `\n- High contrast images: ${totalVariations / 3}`,
      `\n- Inverted images: ${totalVariations / 3}`
    );
    return results;
  } catch (e) {
    console.error('Fatal error in preprocessImageData:', e);
    return results;
  }
}

async function detectQRCodeWithJsQR(imageData: ImageData): Promise<string | null> {
  console.log('Attempting to detect QR code with jsQR');
  console.log('Image dimensions:', imageData.width, 'x', imageData.height);
  console.log('Image data buffer size:', imageData.data.length);

  try {
    if (imageData.width === 0 || imageData.height === 0) {
      throw new Error('Invalid image dimensions');
    }

    console.log('Creating Uint8ClampedArray from image data');
    const data = new Uint8ClampedArray(imageData.data.buffer);
    console.log('Uint8ClampedArray created, length:', data.length);

    console.log('Running jsQR detection...');
    const code = jsQR(data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });
    
    if (code) {
      console.log('jsQR successfully detected QR code');
      console.log('QR code location:', JSON.stringify(code.location));
      console.log('Raw QR data length:', code.data.length);
      console.log('Raw QR data preview:', code.data.substring(0, 50) + '...');
      return code.data;
    }

    console.log('jsQR did not detect any QR code');
    return null;
  } catch (e) {
    console.error('jsQR detection error:', e);
    console.error('Error type:', e?.constructor?.name);
    console.error('Error details:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function detectQRCodeWithZXing(element: HTMLImageElement | HTMLCanvasElement): Promise<string | null> {
  console.log('Attempting to detect QR code with ZXing');
  console.log('Element type:', element instanceof HTMLCanvasElement ? 'Canvas' : 'Image');
  console.log('Element dimensions:', element.width, 'x', element.height);

  const codeReader = new BrowserQRCodeReader();
  
  try {
    console.log('Initializing ZXing decoder...');
    let result;

    if (element instanceof HTMLCanvasElement) {
      console.log('Decoding from canvas...');
      result = await codeReader.decodeFromCanvas(element);
    } else {
      console.log('Decoding from image element...');
      result = await codeReader.decodeFromImageElement(element);
    }
    
    if (result) {
      console.log('ZXing successfully detected QR code');
      console.log('Result format:', result.getBarcodeFormat());
      const text = result.getText();
      console.log('Raw QR data length:', text.length);
      console.log('Raw QR data preview:', text.substring(0, 50) + '...');
      return text;
    }

    console.log('ZXing did not detect any QR code');
    return null;
  } catch (e) {
    console.error('ZXing detection error:', e);
    console.error('Error type:', e?.constructor?.name);
    console.error('Error details:', e instanceof Error ? e.message : String(e));
    if (e instanceof Error && e.stack) {
      console.error('Error stack:', e.stack);
    }
    return null;
  }
}

export async function extractQrFromImage(input: string): Promise<string> {
  const startTime = performance.now();
  console.log('\n=== QR Extraction Process Started ===');
  console.log(`[Timing] Started at ${new Date().toISOString()}`);
  console.log('Input type:', typeof input);
  console.log('Input length:', input.length);
  console.log('Input prefix:', input.substring(0, 50) + '...');
  
  try {
    let qrData: string | null = null;

    // If input is already QR data (not an image), return it as is
    if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
      console.log('Input is raw QR data, returning as is');
      const endTime = performance.now();
      console.log(`[Timing] Raw data process completed in ${(endTime - startTime).toFixed(2)}ms`);
      return input;
    }

    console.log('\n[Phase 1] Image Loading');
    const imageLoadStart = performance.now();
    const img = document.createElement('img');
    
    // Add crossOrigin attribute to handle CORS
    img.crossOrigin = 'anonymous';
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Image loading timed out after 10 seconds'));
      }, 10000);

      img.onload = () => {
        clearTimeout(timeout);
        const imageLoadEnd = performance.now();
        console.log(`[Timing] Image loaded in ${(imageLoadEnd - imageLoadStart).toFixed(2)}ms`);
        console.log('Image dimensions:', img.width, 'x', img.height);
        console.log('Image natural dimensions:', img.naturalWidth, 'x', img.naturalHeight);
        if (img.width === 0 || img.height === 0) {
          reject(new Error('Image loaded with invalid dimensions'));
          return;
        }
        resolve();
      };

      img.onerror = (event: Event | string) => {
        clearTimeout(timeout);
        const errorMessage = event instanceof Event ? 'Image loading failed' : event;
        console.error('Error loading image:', errorMessage);
        reject(new Error('Failed to load image: ' + errorMessage));
      };

      const imgSrc = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
      console.log('Setting image source with prefix:', imgSrc.substring(0, 30) + '...');
      img.src = imgSrc;
    });

    // Try original image first
    console.log('\n[Phase 2] Initial QR Detection');
    const initialDetectionStart = performance.now();
    try {
      qrData = await detectQRCodeWithZXing(img);
      const initialDetectionEnd = performance.now();
      console.log(`[Timing] Initial ZXing detection completed in ${(initialDetectionEnd - initialDetectionStart).toFixed(2)}ms`);
      console.log('ZXing detection result:', qrData ? 'Success' : 'Failed');
    } catch (e) {
      console.error('ZXing detection error:', e);
      console.log('Proceeding to fallback methods...');
    }
    
    if (!qrData) {
      console.log('\n[Phase 3] Fallback Detection with Preprocessing');
      const preprocessStart = performance.now();
      console.log('Initial ZXing detection failed, trying image preprocessing...');
      const variations = await preprocessImageData(img);
      const preprocessEnd = performance.now();
      console.log(`[Timing] Image preprocessing completed in ${(preprocessEnd - preprocessStart).toFixed(2)}ms`);
      console.log(`Generated ${variations.length} different image variations for processing`);
      
      const fallbackDetectionStart = performance.now();
      let variationIndex = 0;
      for (const variation of variations) {
        variationIndex++;
        console.log(`\nProcessing variation ${variationIndex}/${variations.length}`);
        console.log(`Image size: ${variation.imageData.width}x${variation.imageData.height}`);
        
        const jsQRStart = performance.now();
        console.log('Attempting detection with jsQR...');
        qrData = await detectQRCodeWithJsQR(variation.imageData);
        if (qrData) {
          const jsQREnd = performance.now();
          console.log(`[Timing] jsQR detection successful in ${(jsQREnd - jsQRStart).toFixed(2)}ms`);
          console.log('jsQR successfully detected QR code in variation', variationIndex);
          break;
        }
        
        const zxingStart = performance.now();
        console.log('jsQR failed, trying ZXing...');
        qrData = await detectQRCodeWithZXing(variation.canvas);
        if (qrData) {
          const zxingEnd = performance.now();
          console.log(`[Timing] ZXing detection successful in ${(zxingEnd - zxingStart).toFixed(2)}ms`);
          console.log('ZXing successfully detected QR code in variation', variationIndex);
          break;
        }
        console.log('Both detection methods failed for variation', variationIndex);
      }
      const fallbackDetectionEnd = performance.now();
      console.log(`[Timing] Fallback detection completed in ${(fallbackDetectionEnd - fallbackDetectionStart).toFixed(2)}ms`);
    }

    if (!qrData) {
      console.error('QR detection failed after trying all variations');
      throw new Error('Could not detect QR code in image. Please ensure the image is clear and properly cropped around the QR code.');
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    console.log('\n=== QR Extraction Complete ===');
    console.log('Successfully extracted QR data');
    console.log('QR data length:', qrData.length);
    console.log('QR data starts with:', qrData.substring(0, 50) + '...');
    console.log(`[Timing] Total QR extraction time: ${totalTime.toFixed(2)}ms`);
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