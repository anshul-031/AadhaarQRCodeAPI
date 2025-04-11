import { Buffer } from 'buffer';
import pako from 'pako';
import { XMLParser } from 'fast-xml-parser';

export interface AadhaarData {
  name: string;
  gender: string;
  dob: string;
  address: string;
  photo?: string | null; // Base64 encoded photo
  issued_date: string;
  issued_time: string;
  mobile_number: string;
  uid?: string;
  // Add other fields from secure QR if needed
  yob?: string;
  co?: string;
  house_no?: string;
  vtc?: string;
  po?: string;
  street?: string;
  dist?: string;
  state?: string;
  pc?: string;
  email?: string;
  raw_data?: string[]; // Keep raw fields if helpful for debugging
  date_field_index?: number; // Keep index if helpful
}

// --- Start: New Photo Extraction Logic ---

// Define known image markers
const MARKERS = {
  JP2_SIGNATURE: [0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20], // JP2 signature
  JPEG_CODSTREAM: [0xFF, 0x4F, 0xFF, 0x51], // JPEG 2000 codestream
  JPEG_SOI: [0xFF, 0xD8, 0xFF], // JPEG Start Of Image
  PNG_SIGNATURE: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG signature
};

// Define end markers
const END_MARKERS = {
  JPEG_EOI: [0xFF, 0xD9], // JPEG End Of Image
  PNG_IEND: [0x49, 0x45, 0x4E, 0x44], // PNG IEND chunk identifier (bytes for "IEND")
};

/**
 * Finds the first occurrence of any known image marker in the byte array.
 * @param byteData The decompressed QR data as a Uint8Array.
 * @returns An object containing the start position and the marker type, or null if not found.
 */
function findImageMarkers(byteData: Uint8Array): { position: number; type: keyof typeof MARKERS } | null {
  for (const type in MARKERS) {
    const marker = MARKERS[type as keyof typeof MARKERS];
    for (let i = 0; (i = byteData.indexOf(marker[0], i)) !== -1; i++) {
      // Check if the full marker sequence matches
      let match = true;
      for (let j = 1; j < marker.length; j++) {
        if (i + j >= byteData.length || byteData[i + j] !== marker[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        console.log(`Found marker ${type} at position ${i}`);
        return { position: i, type: type as keyof typeof MARKERS };
      }
      // Move past the first byte to avoid infinite loops on repeating bytes
      if (marker.length === 1) i++;
    }
  }
  console.log('No image markers found.');
  return null;
}

/**
 * Finds the end position of an image based on its type.
 * @param byteData The decompressed QR data.
 * @param startPos The starting position of the image marker.
 * @param markerType The type of marker found.
 * @returns The end position (exclusive) of the image data, or -1 if not found.
 */
function findImageEndPosition(byteData: Uint8Array, startPos: number, markerType: keyof typeof MARKERS): number {
  let endPos = -1;

  if (markerType === 'JPEG_SOI' || markerType === 'JPEG_CODSTREAM') {
    const eoiMarker = END_MARKERS.JPEG_EOI;
    for (let i = startPos + 2; (i = byteData.indexOf(eoiMarker[0], i)) !== -1; i++) {
       if (i + 1 < byteData.length && byteData[i + 1] === eoiMarker[1]) {
         endPos = i + 2; // Include the EOI marker
         console.log(`Found JPEG EOI marker at ${i}, end position: ${endPos}`);
         break;
       }
       i++; // Move past the first byte
    }
  } else if (markerType === 'PNG_SIGNATURE') {
    const iendMarker = END_MARKERS.PNG_IEND;
    // Search for the IEND chunk identifier "IEND"
     for (let i = startPos + 8; (i = byteData.indexOf(iendMarker[0], i)) !== -1; i++) {
        let match = true;
        for(let j = 1; j < iendMarker.length; j++) {
            if (i + j >= byteData.length || byteData[i+j] !== iendMarker[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            // The IEND chunk structure is: 4 bytes length (usually 0) + 4 bytes "IEND" + 4 bytes CRC
            endPos = i + 8; // Position after IEND identifier + CRC
            console.log(`Found PNG IEND marker starting at ${i}, end position: ${endPos}`);
            break;
        }
        i++; // Move past the first byte
     }
  } else if (markerType === 'JP2_SIGNATURE') {
    // JP2 files don't have a simple universal end marker like JPEG EOI or PNG IEND.
    // The structure is more complex (boxes). A common approach is to look for the
    // start of the *next* significant marker or assume it runs to the end if parsing fails.
    // For simplicity here, similar to the Python script's fallback, we might extract
    // a large chunk or up to the end, hoping it includes the full image.
    // Let's try finding the JPEG EOI as a fallback, as JP2 can embed JPEG streams.
     const eoiMarker = END_MARKERS.JPEG_EOI;
     for (let i = startPos + 8; (i = byteData.indexOf(eoiMarker[0], i)) !== -1; i++) {
        if (i + 1 < byteData.length && byteData[i + 1] === eoiMarker[1]) {
          endPos = i + 2;
          console.log(`Found potential JPEG EOI marker within JP2 at ${i}, end position: ${endPos}`);
          break;
        }
        i++;
     }
     if (endPos === -1) {
        // If no clear end found, take a reasonable guess or the rest of the data.
        // This is unreliable. Let's default to a large chunk or end of data.
        endPos = byteData.length;
        console.log(`JP2 end marker not definitively found, assuming end of data: ${endPos}`);
     }
  }

  if (endPos === -1) {
      console.log(`Could not find end marker for type ${markerType}.`);
  }

  return endPos;
}


/**
 * Extracts the photo data from the decompressed QR byte array.
 * @param decompressedData The decompressed QR data as a Uint8Array.
 * @returns Base64 encoded photo string, or null if not found or invalid.
 */
function extractAadhaarPhoto(decompressedData: Uint8Array): string | null {
  try {
    const markerInfo = findImageMarkers(decompressedData);
    if (!markerInfo) {
      return null;
    }

    const { position: startPos, type: markerType } = markerInfo;
    const endPos = findImageEndPosition(decompressedData, startPos, markerType);

    if (endPos === -1 || endPos <= startPos) {
        console.error(`Invalid end position (${endPos}) found for image starting at ${startPos}`);
        // Fallback: Maybe try taking a fixed large chunk? Or just fail.
        // Let's try taking the rest of the data from startPos as a last resort.
        const potentialImageData = decompressedData.slice(startPos);
         if (potentialImageData.length > 100) { // Arbitrary minimum size
            console.log(`Attempting fallback: taking data from ${startPos} to end.`);
            const photoBase64 = Buffer.from(potentialImageData).toString('base64');
            // Basic validation: Check if it looks like base64 and has reasonable length
            if (photoBase64 && photoBase64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(photoBase64)) {
                 console.log(`Fallback extraction successful (length: ${photoBase64.length}).`);
                 return photoBase64;
            }
         }
         console.error("Fallback extraction failed or data too small.");
         return null; // Give up if end marker logic fails and fallback doesn't work
    }

    const imageBytes = decompressedData.slice(startPos, endPos);
    console.log(`Extracted image byte slice: ${startPos} to ${endPos} (length: ${imageBytes.length})`);

    if (imageBytes.length === 0) {
        console.error("Extracted image byte slice is empty.");
        return null;
    }

    // Convert to Base64
    const photoBase64 = Buffer.from(imageBytes).toString('base64');

    // Basic validation: Check if it looks like base64 and has reasonable length
    if (photoBase64 && photoBase64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(photoBase64)) {
        console.log(`Successfully extracted and Base64 encoded photo (length: ${photoBase64.length}).`);
        // In Node.js, full image validation (like checking if it's a *valid* JPEG/PNG)
        // usually requires external libraries (e.g., 'sharp', 'jimp', or running a ImageMagick command).
        // For now, we rely on finding markers and getting a non-empty Base64 string.
        return photoBase64;
    } else {
        console.error("Failed basic Base64 validation or length check.");
        return null;
    }

  } catch (error) {
    console.error('Error extracting Aadhaar photo:', error);
    return null;
  }
}

// --- End: New Photo Extraction Logic ---


// Helper function to convert base10 string to byte array
function convertBase10ToBytes(qrData: string): Uint8Array {
  try {
    console.log('Converting QR data (base10):', qrData.substring(0, 50) + '...');
    if (qrData.startsWith('data:')) {
      throw new Error('Received image data instead of QR code string');
    }

    const bigInt = BigInt(qrData);
    const hex = bigInt.toString(16);
    // Ensure hex string has an even number of digits for Buffer conversion
    const paddedHex = hex.length % 2 ? '0' + hex : hex;
    // Use Buffer.from for robust hex conversion
    const buffer = Buffer.from(paddedHex, 'hex');
    return new Uint8Array(buffer);

  } catch (e: any) {
     // Improved check for already decoded data
     if (typeof qrData === 'string' && qrData.includes('ÿ')) {
        const fields = qrData.split('ÿ');
        // A more robust check might involve looking for specific field patterns
        // or a minimum number of delimiters expected in decoded data.
        const potentialDateField = fields.find(f => f && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/.test(f));
        if (potentialDateField) {
            console.warn('Input data appears to be already decoded (contains delimiters and date).');
            throw new Error('ALREADY_DECODED');
        }
     }
     console.error('Failed to convert base10 to bytes:', e.message);
     // Provide more context in the error
     throw new Error(`Invalid QR data format or conversion error: ${e.message}`);
  }
}

// Helper to parse the delimited string data
function parseDelimitedData(decodedText: string, photoBase64: string | null): AadhaarData {
    console.log('Parsing delimited text:', decodedText.substring(0, 100) + '...');
    const fields = decodedText.split('ÿ');
    let dateFieldIndex = -1;
    let dateField: string | undefined = undefined;

    // Find the first field that looks like a date (more robustly)
    for (let i = 0; i < fields.length; i++) {
        // Regex allows YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
        if (fields[i] && /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{2}-\d{2}-\d{4}$/.test(fields[i])) {
            dateField = fields[i];
            dateFieldIndex = i;
            console.log(`Found date field '${dateField}' at index ${dateFieldIndex}`);
            break;
        }
    }

    if (dateFieldIndex === -1) {
        console.error('Could not find a valid date field in the delimited data.');
        console.error('Fields:', fields); // Log fields for debugging
        throw new Error('Invalid QR code format - no valid date field found');
    }

    // Extract fields relative to the date field index, matching Python logic indices
    // Python indices relative to date_field_index:
    // uid_last4: date_field_index - 4 + 2 (slice [:4]) -> date_field_index - 2 (slice [:4])
    // name: date_field_index - 4 + 3 -> date_field_index - 1
    // issued_date: date_field_index - 4 + 2 (slice [10:12], [8:10], [4:8]) -> date_field_index - 2
    // issued_time: date_field_index - 4 + 2 (slice [12:14], [14:16], [16:18]) -> date_field_index - 2
    // gender: date_field_index - 4 + 5 -> date_field_index + 1
    // dob: date_field_index - 4 + 4 -> date_field_index
    // mobile: date_field_index - 4 + 17 -> date_field_index + 13
    // email: date_field_index - 4 + 46 -> date_field_index + 42
    // co: date_field_index - 4 + 6 -> date_field_index + 2
    // house: date_field_index - 4 + 8 -> date_field_index + 4
    // vtc: date_field_index - 4 + 7 -> date_field_index + 3
    // street: date_field_index - 4 + 10 -> date_field_index + 6
    // dist: date_field_index - 4 + 12 -> date_field_index + 8
    // state: date_field_index - 4 + 13 -> date_field_index + 9
    // pc: date_field_index - 4 + 11 -> date_field_index + 7

    const getField = (index: number): string => fields[index] || '';

    const rawUidField = getField(dateFieldIndex - 2);
    const uid = rawUidField ? 'xxxxxxxx' + rawUidField.slice(0, 4) : ''; // Masked Aadhaar

    let issued_date = '';
    let issued_time = '';
    if (rawUidField && rawUidField.length >= 18) {
        try {
            issued_date = `${rawUidField.substring(10, 12)}/${rawUidField.substring(8, 10)}/${rawUidField.substring(4, 8)}`;
            issued_time = `${rawUidField.substring(12, 14)}:${rawUidField.substring(14, 16)}:${rawUidField.substring(16, 18)}`;
        } catch (e) { console.error("Error parsing issue date/time from field:", rawUidField); }
    }

    const name = getField(dateFieldIndex - 1);
    const gender = getField(dateFieldIndex + 1);
    const dob = getField(dateFieldIndex); // This is the date field itself
    const mobile_number = getField(dateFieldIndex + 13);
    const email = getField(dateFieldIndex + 42);
    const co = getField(dateFieldIndex + 2);
    const house_no = getField(dateFieldIndex + 4);
    const vtc = getField(dateFieldIndex + 3);
    const street = getField(dateFieldIndex + 6);
    const dist = getField(dateFieldIndex + 8);
    const state = getField(dateFieldIndex + 9);
    const pc = getField(dateFieldIndex + 7);

    // Construct address string (similar to Python)
    const address = [co, house_no, street, vtc, dist, state, pc].filter(Boolean).join(', ');
    // Extract YOB from DOB if possible
    let yob = '';
    if (dob) {
        const dobParts = dob.match(/(\d{4})$/); // Try to get YYYY from end
        if (dobParts) {
            yob = dobParts[1];
        } else {
            const dobPartsAlt = dob.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/); // DD/MM/YYYY or DD-MM-YYYY
            if (dobPartsAlt) {
                yob = dobPartsAlt[3];
            }
        }
    }


    const data: AadhaarData = {
        uid,
        name,
        gender,
        dob,
        yob,
        mobile_number,
        email,
        co,
        house_no,
        vtc,
        street,
        dist,
        state,
        pc,
        address,
        issued_date,
        issued_time,
        photo: photoBase64, // Assign extracted photo here
        raw_data: fields, // Optional: include raw fields for debugging
        date_field_index: dateFieldIndex // Optional: include index
    };

    console.log("Parsed Aadhaar Data:", JSON.stringify(data, null, 2));
    return data;
}


export async function parseAadhaarQr(qrData: string): Promise<AadhaarData> {
  try {
    // 1. Handle XML formats first
    if (qrData.startsWith('<?xml') || qrData.startsWith('<QPD')) {
      console.log('Processing XML format QR data');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        allowBooleanAttributes: true,
        parseAttributeValue: true, // Attempt to parse numbers/booleans in attributes
      });

      let result;
      try {
          // Handle potential malformed XML start tag like </?xml...>
          const cleanedXml = qrData.startsWith('</?xml') ? qrData.replace('</?xml', '<?xml') : qrData;
          result = parser.parse(cleanedXml);
          console.log('Parsed XML structure:', JSON.stringify(result, null, 2));
      } catch (xmlError: any) {
          console.error("XML Parsing Error:", xmlError);
          throw new Error(`Failed to parse XML QR data: ${xmlError.message}`);
      }


      if (qrData.startsWith('<?xml') || qrData.startsWith('</?xml')) {
        // Standard XML format (PrintLetterBarcodeData)
        const root = result.PrintLetterBarcodeData || result['?xml']?.PrintLetterBarcodeData || {}; // Handle potential variations
        if (!root || Object.keys(root).length === 0) {
             console.error("Could not find PrintLetterBarcodeData in XML:", JSON.stringify(result));
             throw new Error("Invalid XML structure: Missing PrintLetterBarcodeData");
        }
        return {
          uid: String(root['@_uid'] || ''), // Ensure string type
          name: String(root['@_name'] || ''),
          gender: String(root['@_gender'] || ''),
          dob: String(root['@_dob'] || ''), // Date of Birth
          yob: String(root['@_yob'] || ''), // Year of Birth might be separate
          co: String(root['@_co'] || ''), // Care Of
          house_no: String(root['@_house'] || ''), // House Number/Name
          street: String(root['@_street'] || ''), // Street Name
          vtc: String(root['@_vtc'] || ''), // Village / Town / City
          dist: String(root['@_dist'] || ''), // District
          state: String(root['@_state'] || ''), // State
          pc: String(root['@_pc'] || ''), // Pincode
          po: String(root['@_po'] || ''), // Post Office Name
          // Construct address string from available components
          address: [
            root['@_co'], root['@_house'], root['@_street'], root['@_lm'],
            root['@_loc'], root['@_vtc'], root['@_po'], root['@_subdist'],
            root['@_dist'], root['@_state'], root['@_pc']
          ].filter(Boolean).join(', '),
          photo: null, // Standard XML format doesn't contain photo
          issued_date: '', // Not typically in this format
          issued_time: '', // Not typically in this format
          mobile_number: '', // Not typically in this format
        };
      } else {
        // QPD XML format
        const root = result.QPDA || result.QPDB || {}; // Check for both variations
         if (!root || Object.keys(root).length === 0) {
             console.error("Could not find QPDA or QPDF in XML:", JSON.stringify(result));
             throw new Error("Invalid QPD XML structure: Missing QPDA/QPDB root");
        }
        // QPD format attributes might be different (e.g., 'u' for uid, 'n' for name)
        let photoBase64 = root['@_i'] || null; // Image data is usually in 'i' attribute

        // Basic validation for photo data
        if (photoBase64 && typeof photoBase64 === 'string' && photoBase64.length < 50) {
            console.warn("QPD Photo data seems too short, discarding:", photoBase64);
            photoBase64 = null; // Discard potentially invalid short data
        }

        return {
          uid: String(root['@_u'] || ''),
          name: String(root['@_n'] || ''),
          gender: String(root['@_g'] || ''),
          dob: String(root['@_d'] || ''),
          address: String(root['@_a'] || ''),
          photo: photoBase64, // Assign photo from 'i' attribute
          issued_date: '', // Not typically in this format
          issued_time: '', // Not typically in this format
          mobile_number: String(root['@_m'] || ''), // Mobile might be in 'm'
          // Add other QPD specific fields if known (e.g., signature 's')
        };
      }
    }

    // 2. Process Secure QR Format (assuming base10 encoded initially)
    console.log('Processing secure QR format');
    let decompressed: Uint8Array;
    let decodedText: string;
    let isAlreadyDecoded = false;

    try {
      const byteArray = convertBase10ToBytes(qrData);
      decompressed = pako.inflate(byteArray);
      decodedText = new TextDecoder('iso-8859-1').decode(decompressed);
      console.log('Data decompressed successfully.');
    } catch (e: any) {
      if (e.message === 'ALREADY_DECODED') {
        // Handle case where input was already the delimited string
        console.warn('Input data was already decoded. Proceeding with parsing.');
        decodedText = qrData;
        // We don't have the original byte array to extract photo from in this case.
        // Photo extraction is only possible if the input was the original base10/byte data.
        decompressed = new Uint8Array(); // Empty array, photo extraction will fail
        isAlreadyDecoded = true;
      } else {
        console.error('Error during conversion or decompression:', e);
        throw new Error(`Invalid secure QR data or decompression failed: ${e.message}`);
      }
    }

    // 3. Extract Photo (only if data was successfully decompressed)
    let photoBase64: string | null = null;
    if (!isAlreadyDecoded && decompressed.length > 0) {
        console.log(`Attempting photo extraction from ${decompressed.length} decompressed bytes.`);
        photoBase64 = extractAadhaarPhoto(decompressed);
        if (photoBase64) {
            console.log("Photo extracted successfully.");
        } else {
            console.log("No photo found or extracted from QR data.");
        }
    } else if (isAlreadyDecoded) {
        console.warn("Cannot extract photo from already decoded string data.");
    }


    // 4. Parse the delimited text data
    const aadhaarData = parseDelimitedData(decodedText, photoBase64);
    return aadhaarData;

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
    console.error(`Failed to parse Aadhaar QR data: ${errorMessage}`, e); // Log the full error
    // Re-throw a clean error message for the API layer
    throw new Error(`Failed to parse Aadhaar QR data: ${errorMessage}`);
  }
}