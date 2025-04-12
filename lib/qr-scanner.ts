// Import Dynamsoft configuration (this ensures the license is initialized)
import './dynamsoft-config'; // Make sure this path is correct relative to qr-scanner.ts


// Import Dynamsoft modules
import { CaptureVisionRouter } from "dynamsoft-capture-vision-router";
import { BarcodeResultItem, EnumBarcodeFormat } from "dynamsoft-barcode-reader";
import { EnumCapturedResultItemType } from "dynamsoft-core";

// Removed interfaces and helper functions related to jsQR/ZXing fallbacks

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

    // Use the template name defined in the custom settings JSON ("Default_1")
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

// --- Simplified Extraction Function (Dynamsoft Only) ---
export async function extractQrFromImage(input: string): Promise<string> {
  console.log('Starting QR extraction from image (Dynamsoft Only)');
  let qrData: string | null = null;

  // If input is already QR data (not an image), return it as is
  if (!input.startsWith('data:image') && !input.startsWith('iVBOR')) {
    console.log('Input is raw QR data, returning as is');
    return input;
  }

  // --- Strategy: Use Dynamsoft with custom settings ---
  console.log('Attempting QR detection with Dynamsoft...');
  try {
    qrData = await detectQRCodeWithDynamsoft(input);
    if (qrData) {
      console.log('Success: QR extracted using Dynamsoft.');
    } else {
      console.log('Dynamsoft did not find a QR code.');
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
    }
  }

  // If Dynamsoft failed to find a QR code
  if (!qrData) {
    const finalError = 'Could not detect QR code in image using Dynamsoft with the provided settings.';
    console.error(finalError);
    throw new Error(finalError + ' Please ensure the image is clear and properly cropped around the QR code.');
  }

  console.log('Successfully extracted QR data:', qrData.substring(0, 50) + '...');
  return qrData;
}


// --- Commented out functions relying on removed libraries ---

/*
// Note: analyzeQRDetectionMethods relied on jsQR and ZXing variations.
// It needs significant rework to analyze Dynamsoft performance if required.
export async function analyzeQRDetectionMethods(input: string): Promise<any[]> { // Return type changed to any[]
  console.warn("analyzeQRDetectionMethods is commented out as it relied on removed libraries (jsQR, ZXing).");
  return []; // Return empty array
}
*/

/*
// Note: extractQrFromVideo relied on ZXing's BrowserQRCodeReader.
// It needs to be reimplemented using Dynamsoft's VideoRecognizer if video scanning is needed.
export function extractQrFromVideo(videoElement: HTMLVideoElement): Promise<string> {
  console.warn("extractQrFromVideo is commented out as it relied on the removed ZXing library.");
  return Promise.reject(new Error("extractQrFromVideo is not implemented with Dynamsoft yet."));
}
*/