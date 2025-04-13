import cv from '@techstark/opencv-js';
import './dynamsoft-config'; // Make sure this path is correct relative to qr-scanner.ts

// ... (rest of Dynamsoft imports) ...
import { CaptureVisionRouter } from "dynamsoft-capture-vision-router";
import { BarcodeResultItem, EnumBarcodeFormat } from "dynamsoft-barcode-reader";
import { EnumCapturedResultItemType } from "dynamsoft-core";


// --- OpenCV Preprocessing Function ---

/**
 * Converts a base64 image string to an HTMLImageElement.
 */
function loadImageElement(base64Image: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = base64Image.startsWith('data:image') ? base64Image : `data:image/jpeg;base64,${base64Image}`; // Handle both formats
    });
}

/**
 * Preprocesses an image to detect and crop the main document area.
 * @param input Base64 encoded image string or an HTMLImageElement.
 * @returns A Promise resolving to the preprocessed image as a base64 data URL, or the original input if preprocessing fails.
 */
async function preprocessImageForQR(input: string | HTMLImageElement): Promise<string | HTMLImageElement> {
    console.log("Starting image preprocessing with OpenCV.js...");
    const startTime = performance.now();

    let imageElement: HTMLImageElement;
    let originalSrc: string;

    if (typeof input === 'string') {
        originalSrc = input; // Keep original base64 string
        try {
            imageElement = await loadImageElement(input);
        } catch (error) {
            console.error("Failed to load image element from base64 string:", error);
            return input; // Return original input if loading fails
        }
    } else {
        imageElement = input;
        originalSrc = imageElement.src; // Assume src is base64 or object URL
    }

    if (!cv || !cv.imread) {
         console.warn("OpenCV.js not ready or imread not found. Skipping preprocessing.");
         return input; // Return original if OpenCV isn't loaded/ready
    }

    let src: cv.Mat | null = null;
    let gray: cv.Mat | null = null;
    let blurred: cv.Mat | null = null;
    let thresh: cv.Mat | null = null;
    let contours: cv.MatVector | null = null;
    let hierarchy: cv.Mat | null = null;
    let cropped: cv.Mat | null = null;
    let canvas: HTMLCanvasElement | null = null;

    try {
        src = cv.imread(imageElement);
        if (src.empty()) {
            console.warn("OpenCV could not read the image. Skipping preprocessing.");
            return input;
        }

        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        blurred = new cv.Mat();
        // Apply Gaussian blur to reduce noise and improve contour detection
        let ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

        thresh = new cv.Mat();
        // Use Otsu's thresholding to automatically determine the threshold value
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

        // Optional: Apply morphological operations (e.g., closing) to fill gaps
        let M = cv.Mat.ones(5, 5, cv.CV_8U);
        let closed = new cv.Mat();
        cv.morphologyEx(thresh, closed, cv.MORPH_CLOSE, M);


        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        // Find contours - Use RETR_EXTERNAL to get only outer contours
        cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        closed.delete(); M.delete(); // Clean up intermediate mats

        if (contours.size() === 0) {
            console.log("No contours found. Skipping cropping.");
            return input;
        }

        // Find the largest contour by area
        let maxArea = 0;
        let largestContourIndex = -1;
        for (let i = 0; i < contours.size(); ++i) {
            let contour = contours.get(i);
            let area = cv.contourArea(contour, false);
            if (area > maxArea) {
                maxArea = area;
                largestContourIndex = i;
            }
            contour.delete(); // Delete contour after use
        }


        if (largestContourIndex === -1) {
             console.log("Could not determine largest contour. Skipping cropping.");
             return input;
        }

        let largestContour = contours.get(largestContourIndex); // Get the largest one again
        let rect = cv.boundingRect(largestContour);
        largestContour.delete(); // Delete the contour mat

        // Add some padding (optional, adjust as needed)
        const padding = 10; // pixels
        let x = Math.max(0, rect.x - padding);
        let y = Math.max(0, rect.y - padding);
        let width = Math.min(src.cols - x, rect.width + padding * 2);
        let height = Math.min(src.rows - y, rect.height + padding * 2);

        // Ensure dimensions are valid
        if (width <= 0 || height <= 0) {
             console.warn("Invalid crop dimensions calculated. Skipping cropping.");
             return input;
        }

        let roi = new cv.Rect(x, y, width, height);
        cropped = src.roi(roi);

        // Convert the cropped Mat back to a data URL
        canvas = document.createElement('canvas');
        cv.imshow(canvas, cropped);
        const dataUrl = canvas.toDataURL('image/png'); // Or 'image/jpeg'

        const endTime = performance.now();
        console.log(`OpenCV preprocessing took: ${(endTime - startTime).toFixed(2)} ms. Cropped to ${width}x${height}.`);

        return dataUrl; // Return the cropped image data URL

    } catch (error) {
        console.error("Error during OpenCV preprocessing:", error);
        return input; // Return original input on error
    } finally {
        // --- IMPORTANT: Clean up all allocated OpenCV Mats ---
        src?.delete();
        gray?.delete();
        blurred?.delete();
        thresh?.delete();
        contours?.delete();
        hierarchy?.delete();
        cropped?.delete();
        // Note: largestContour and intermediate contours were deleted in the loop/logic
        if (canvas) {
            // Optional: remove canvas from DOM if it was added, though here it's in memory
        }
    }
}


// --- Dynamsoft Detection Function (getDynamsoftRouter, detectQRCodeWithDynamsoft) ---
// ... (Keep the existing getDynamsoftRouter and detectQRCodeWithDynamsoft functions as they are) ...
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

      // Apply the custom settings provided by the user
      const dynamsoftSettingsJson = `{
    "BarcodeFormatSpecificationOptions": [
        {
            "AllModuleDeviation": 0,
            "AustralianPostEncodingTable": "C",
            "BarcodeAngleRangeArray": null,
            "BarcodeBytesLengthRangeArray": null,
            "BarcodeComplementModes": null,
            "BarcodeFormatIds": [
                "BF_PDF417",
                "BF_QR_CODE",
                "BF_DATAMATRIX",
                "BF_AZTEC",
                "BF_MICRO_QR",
                "BF_MICRO_PDF417",
                "BF_DOTCODE"
            ],
            "BarcodeHeightRangeArray": null,
            "BarcodeTextLengthRangeArray": null,
            "BarcodeTextRegExPattern": "",
            "BarcodeWidthRangeArray": null,
            "BarcodeZoneBarCountRangeArray": null,
            "BarcodeZoneMinDistanceToImageBorders": 0,
            "BaseBarcodeFormatSpecification": "",
            "Code128Subset": "",
            "DeformationResistingModes": null,
            "EnableAddOnCode": 0,
            "EnableDataMatrixECC000-140": 0,
            "EnableQRCodeModel1": 0,
            "FindUnevenModuleBarcode": 1,
            "HeadModuleRatio": "",
            "MSICodeCheckDigitCalculation": "MSICCDC_MOD_10",
            "MinQuietZoneWidth": 4,
            "MinRatioOfBarcodeZoneWidthToHeight": 0,
            "MinResultConfidence": 30,
            "MirrorMode": "MM_BOTH",
            "ModuleSizeRangeArray": null,
            "Name": "bfs1-read-rate-first",
            "PartitionModes": [
                "PM_WHOLE_BARCODE",
                "PM_ALIGNMENT_PARTITION"
            ],
            "PatchCodeSearchingMargins": {
                "Bottom": 20,
                "Left": 20,
                "MeasuredByPercentage": 1,
                "Right": 20,
                "Top": 20
            },
            "RequireStartStopChars": 1,
            "ReturnPartialBarcodeValue": 1,
            "StandardFormat": "",
            "TailModuleRatio": "",
            "VerifyCheckDigit": 0
        },
        {
            "AllModuleDeviation": 0,
            "AustralianPostEncodingTable": "C",
            "BarcodeAngleRangeArray": null,
            "BarcodeBytesLengthRangeArray": null,
            "BarcodeComplementModes": null,
            "BarcodeFormatIds": [
                "BF_ALL"
            ],
            "BarcodeHeightRangeArray": null,
            "BarcodeTextLengthRangeArray": null,
            "BarcodeTextRegExPattern": "",
            "BarcodeWidthRangeArray": null,
            "BarcodeZoneBarCountRangeArray": null,
            "BarcodeZoneMinDistanceToImageBorders": 0,
            "BaseBarcodeFormatSpecification": "",
            "Code128Subset": "",
            "DeformationResistingModes": null,
            "EnableAddOnCode": 0,
            "EnableDataMatrixECC000-140": 0,
            "EnableQRCodeModel1": 0,
            "FindUnevenModuleBarcode": 1,
            "HeadModuleRatio": "",
            "MSICodeCheckDigitCalculation": "MSICCDC_MOD_10",
            "MinQuietZoneWidth": 4,
            "MinRatioOfBarcodeZoneWidthToHeight": 0,
            "MinResultConfidence": 30,
            "MirrorMode": "MM_NORMAL",
            "ModuleSizeRangeArray": null,
            "Name": "bfs2-read-rate-first",
            "PartitionModes": [
                "PM_WHOLE_BARCODE",
                "PM_ALIGNMENT_PARTITION"
            ],
            "PatchCodeSearchingMargins": {
                "Bottom": 20,
                "Left": 20,
                "MeasuredByPercentage": 1,
                "Right": 20,
                "Top": 20
            },
            "RequireStartStopChars": 1,
            "ReturnPartialBarcodeValue": 1,
            "StandardFormat": "",
            "TailModuleRatio": "",
            "VerifyCheckDigit": 0
        }
    ],
    "BarcodeReaderTaskSettingOptions": [
        {
            "BarcodeColourModes": null,
            "BarcodeComplementModes": [
                {
                    "Mode": "BCM_SKIP"
                }
            ],
            "BarcodeFormatIds": [
                "BF_QR_CODE",
                "BF_MICRO_QR"
            ],
            "BarcodeFormatSpecificationNameArray": [
                "bfs1-read-rate-first",
                "bfs2-read-rate-first"
            ],
            "BaseBarcodeReaderTaskSettingName": "",
            "DPMCodeReadingModes": [
                {
                    "BarcodeFormat": "BF_DATAMATRIX",
                    "Mode": "DPMCRM_GENERAL"
                }
            ],
            "DeblurModes": null,
            "DeformationResistingModes": [
                {
                    "BinarizationMode": {
                        "BinarizationThreshold": -1,
                        "BlockSizeX": 0,
                        "BlockSizeY": 0,
                        "EnableFillBinaryVacancy": 1,
                        "GrayscaleEnhancementModesIndex": -1,
                        "Mode": "BM_LOCAL_BLOCK",
                        "MorphOperation": "Close",
                        "MorphOperationKernelSizeX": -1,
                        "MorphOperationKernelSizeY": -1,
                        "MorphShape": "Rectangle",
                        "ThresholdCompensation": 10
                    },
                    "GrayscaleEnhancementMode": {
                        "Mode": "GEM_AUTO",
                        "Sensitivity": -1,
                        "SharpenBlockSizeX": -1,
                        "SharpenBlockSizeY": -1,
                        "SmoothBlockSizeX": -1,
                        "SmoothBlockSizeY": -1
                    },
                    "Level": 5,
                    "Mode": "DRM_SKIP"
                }
            ],
            "ExpectedBarcodesCount": 1,
            "LocalizationModes": [
                {
                    "ConfidenceThreshold": 60,
                    "IsOneDStacked": 0,
                    "Mode": "LM_CONNECTED_BLOCKS",
                    "ModuleSize": 0,
                    "ScanDirection": 0,
                    "ScanStride": 0
                },
                {
                    "ConfidenceThreshold": 60,
                    "IsOneDStacked": 0,
                    "Mode": "LM_LINES",
                    "ModuleSize": 0,
                    "ScanDirection": 0,
                    "ScanStride": 0
                },
                {
                    "ConfidenceThreshold": 60,
                    "IsOneDStacked": 0,
                    "Mode": "LM_STATISTICS",
                    "ModuleSize": 0,
                    "ScanDirection": 0,
                    "ScanStride": 0
                }
            ],
            "MaxThreadsInOneTask": 4,
            "Name": "task-read-barcodes-read-rate",
            "ReturnBarcodeZoneClarity": 0,
            "SectionImageParameterArray": [
                {
                    "ContinueWhenPartialResultsGenerated": 1,
                    "ImageParameterName": "ip-read-barcodes-read-rate",
                    "Section": "ST_REGION_PREDETECTION"
                },
                {
                    "ContinueWhenPartialResultsGenerated": 1,
                    "ImageParameterName": "ip-read-barcodes-read-rate",
                    "Section": "ST_BARCODE_LOCALIZATION"
                },
                {
                    "ContinueWhenPartialResultsGenerated": 1,
                    "ImageParameterName": "ip-read-barcodes-read-rate",
                    "Section": "ST_BARCODE_DECODING"
                }
            ],
            "StartSection": "ST_REGION_PREDETECTION",
            "TerminateSetting": {
                "Section": "ST_NULL",
                "Stage": "IRUT_NULL"
            },
            "TextResultOrderModes": [
                {
                    "Mode": "TROM_CONFIDENCE"
                },
                {
                    "Mode": "TROM_POSITION"
                },
                {
                    "Mode": "TROM_FORMAT"
                }
            ]
        }
    ],
    "CaptureVisionTemplates": [
        {
            "ImageROIProcessingNameArray": [
                "roi-read-barcodes-read-rate"
            ],
            "ImageSource": "",
            "MaxParallelTasks": 4,
            "MinImageCaptureInterval": 0,
            "Name": "ReadBarcodes_ReadRateFirst",
            "OutputOriginalImage": 0,
            "SemanticProcessingNameArray": null,
            "Timeout": 100000
        }
    ],
    "GlobalParameter": {
        "MaxTotalImageDimension": 0
    },
    "ImageParameterOptions": [
        {
            "BaseImageParameterName": "",
            "BinarizationModes": [
                {
                    "BinarizationThreshold": -1,
                    "BlockSizeX": 0,
                    "BlockSizeY": 0,
                    "EnableFillBinaryVacancy": 1,
                    "GrayscaleEnhancementModesIndex": -1,
                    "Mode": "BM_LOCAL_BLOCK",
                    "MorphOperation": "Close",
                    "MorphOperationKernelSizeX": -1,
                    "MorphOperationKernelSizeY": -1,
                    "MorphShape": "Rectangle",
                    "ThresholdCompensation": 10
                }
            ],
            "ColourConversionModes": [
                {
                    "BlueChannelWeight": -1,
                    "GreenChannelWeight": -1,
                    "Mode": "CICM_GENERAL",
                    "RedChannelWeight": -1,
                    "ReferChannel": "H_CHANNEL"
                }
            ],
            "GrayscaleEnhancementModes": [
                {
                    "Mode": "GEM_GENERAL",
                    "Sensitivity": -1,
                    "SharpenBlockSizeX": -1,
                    "SharpenBlockSizeY": -1,
                    "SmoothBlockSizeX": -1,
                    "SmoothBlockSizeY": -1
                }
            ],
            "GrayscaleTransformationModes": [
                {
                    "Mode": "GTM_ORIGINAL"
                },
                {
                    "Mode": "GTM_INVERTED"
                }
            ],
            "IfEraseTextZone": 1,
            "Name": "ip-read-barcodes-read-rate",
            "RegionPredetectionModes": [
                {
                    "AspectRatioRange": "[]",
                    "FindAccurateBoundary": 0,
                    "ForeAndBackgroundColours": "[]",
                    "HeightRange": "[]",
                    "ImageParameterName": "",
                    "MeasuredByPercentage": 1,
                    "MinImageDimension": 262144,
                    "Mode": "RPM_GENERAL",
                    "RelativeRegions": "[]",
                    "Sensitivity": 1,
                    "SpatialIndexBlockSize": 5,
                    "WidthRange": "[]"
                }
            ],
            "ScaleDownThreshold": 100000,
            "ScaleUpModes": [
                {
                    "AcuteAngleWithXThreshold": -1,
                    "LetterHeightThreshold": 0,
                    "Mode": "SUM_AUTO",
                    "ModuleSizeThreshold": 0,
                    "TargetLetterHeight": 0,
                    "TargetModuleSize": 0
                }
            ],
            "TextDetectionMode": {
                "CharHeightRange": [
                    1,
                    1000,
                    1
                ],
                "Direction": "UNKNOWN",
                "MaxSpacingInALine": -1,
                "Mode": "TTDM_LINE",
                "Sensitivity": 3,
                "StringLengthRange": null
            },
            "TextureDetectionModes": [
                {
                    "Mode": "TDM_GENERAL_WIDTH_CONCENTRATION",
                    "Sensitivity": 5
                }
            ]
        }
    ],
    "TargetROIDefOptions": [
        {
            "BaseTargetROIDefName": "",
            "Location": {
                "Offset": {
                    "FirstPoint": [
                        0,
                        0,
                        1,
                        1
                    ],
                    "FourthPoint": [
                        0,
                        100,
                        1,
                        1
                    ],
                    "MeasuredByPercentage": 1,
                    "ReferenceObjectOriginIndex": 0,
                    "ReferenceObjectType": "ROT_ATOMIC_OBJECT",
                    "ReferenceXAxis": {
                        "AxisType": "AT_MIDPOINT_EDGE",
                        "EdgeIndex": 0,
                        "LengthReference": "LR_X",
                        "RotationAngle": 90
                    },
                    "ReferenceYAxis": {
                        "AxisType": "AT_MIDPOINT_EDGE",
                        "EdgeIndex": 1,
                        "LengthReference": "LR_Y",
                        "RotationAngle": 90
                    },
                    "SecondPoint": [
                        100,
                        0,
                        1,
                        1
                    ],
                    "ThirdPoint": [
                        100,
                        100,
                        1,
                        1
                    ]
                }
            },
            "Name": "roi-read-barcodes-read-rate",
            "PauseFlag": 0,
            "TaskSettingNameArray": [
                "task-read-barcodes-read-rate"
            ]
        }
    ]
}`;
      const settingsObject = JSON.parse(dynamsoftSettingsJson);
      await cvRouterInstance.initSettings(settingsObject);
      console.log("Dynamsoft CaptureVisionRouter settings initialized from parsed custom JSON object.");
    } catch (error: any) {
      console.error("Failed to create or configure Dynamsoft Router:", error);
      cvRouterPromise = null; // Reset promise if creation failed
      throw error; // Re-throw the error
    }
  } else {
    // If promise exists but instance is not yet set, wait for it
    cvRouterInstance = await cvRouterPromise;
  }
  if (!cvRouterInstance) {
      throw new Error("Failed to get Dynamsoft Router instance after waiting.");
  }
  return cvRouterInstance;
}

async function detectQRCodeWithDynamsoft(input: string | HTMLImageElement | HTMLCanvasElement | Blob | File): Promise<string | null> {
  try {
    const cvRouter = await getDynamsoftRouter();
    let resultText: string | null = null;

    // Use the template name defined in the custom settings JSON
    const templateName = "ReadBarcodes_ReadRateFirst"; // Use the template name from the new settings
    console.log(`Attempting Dynamsoft detection with template: ${templateName}`);
    const startTime = performance.now();
    const result = await cvRouter.capture(input, templateName);
    const endTime = performance.now();
    console.log(`Dynamsoft capture (${templateName}) took: ${(endTime - startTime).toFixed(2)} ms`);

    if (result.items.length > 0) {
        for (let item of result.items) {
            if (item.type === EnumCapturedResultItemType.CRIT_BARCODE) {
                const barcodeItem = item as BarcodeResultItem;
                // Check if it's a QR code (though template should filter)
                if (barcodeItem.format === EnumBarcodeFormat.BF_QR_CODE || barcodeItem.format === EnumBarcodeFormat.BF_MICRO_QR) {
                    resultText = barcodeItem.text;
                    console.log(`Success: QR extracted using Dynamsoft (${templateName}).`);
                    break; // Found a QR code, stop processing items
                }
            }
        }
    }

    if (!resultText) {
        console.log(`Dynamsoft did not find a QR code using template ${templateName}.`);
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


// Define a return type for extractQrFromImage
interface QrExtractionResult {
    qrData: string | null;
    processedImageSrc: string | null; // Base64 data URL of the processed image, or null if no processing/failed
}

// --- Modified Extraction Function ---
export async function extractQrFromImage(input: string): Promise<QrExtractionResult> {
  console.log('Starting QR extraction from image (Preprocessing + Dynamsoft)');
  let qrData: string | null = null;
  let processedImageSrc: string | null = null; // Variable to store the processed image src

  // If input is already QR data (not an image), return it as is
  if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
    console.log('Input is raw QR data, returning as is');
    return { qrData: input, processedImageSrc: null }; // No image processing done
  }

  let processedInput: string | HTMLImageElement = input; // Start with original

  // --- Step 1: Preprocess the image using OpenCV ---
  try {
      const preprocessingResult = await preprocessImageForQR(input);
      if (preprocessingResult !== input && typeof preprocessingResult === 'string') {
          console.log("Image preprocessing successful. Using cropped image for detection.");
          processedInput = preprocessingResult;
          processedImageSrc = preprocessingResult; // Store the base64 string
      } else {
          console.log("Image preprocessing skipped or failed. Using original image for detection.");
          // Keep processedImageSrc as null
      }
  } catch (e: any) {
      console.error('Error during OpenCV preprocessing step:', e);
      // Continue with the original image if preprocessing fails
      processedInput = input;
      // Keep processedImageSrc as null
  }


  // --- Step 2: Attempt QR detection with Dynamsoft using the (potentially) processed image ---
  console.log('Attempting QR detection with Dynamsoft...');
  try {
    // Ensure Dynamsoft gets the correct input type (base64 string or Image element)
    // If preprocessImageForQR returned a base64 string, Dynamsoft can handle it directly.
    // If it returned an HTMLImageElement (e.g., if preprocessing failed), Dynamsoft can also handle it.
    qrData = await detectQRCodeWithDynamsoft(processedInput);

    if (qrData) {
      console.log('Success: QR extracted using Dynamsoft.');
    } else {
      console.log('Dynamsoft did not find a QR code (after potential preprocessing).');
    }
  } catch (e: any) {
    console.error('Error during Dynamsoft detection attempt:', e);
    // Check if it's a license issue or critical failure
    if (e.message && (e.message.includes("License") || e.message.includes("expired") || e.message.includes("Failed to create"))) {
        console.error("Critical Dynamsoft error or license issue. Cannot proceed.");
        // Re-throw the critical error
        throw new Error(`Critical Dynamsoft error: ${e.message}`);
    } else {
        // Non-critical error, likely just didn't find QR. Will throw generic error below.
        console.warn("Dynamsoft detection failed, even after potential preprocessing.");
    }
  }

  // --- Final Step: Handle results ---
  if (qrData) {
    return { qrData, processedImageSrc }; // Return QR data and the processed image src
  } else {
    // QR code not found, but preprocessing might have succeeded.
    // Return null for qrData but include the processed image if available.
    console.warn('Dynamsoft did not find a QR code, returning null QR data.');
    return { qrData: null, processedImageSrc };
  }
}