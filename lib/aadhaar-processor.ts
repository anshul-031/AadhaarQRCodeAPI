import { Buffer } from 'buffer';
import pako from 'pako';
import { XMLParser } from 'fast-xml-parser';

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

// Helper function to convert base10 string to byte array
function convertBase10ToBytes(qrData: string): Uint8Array {
  try {
    console.log('Converting QR data:', qrData.substring(0, 50) + '...');
    
    // If it's already in base64 format, try to process differently
    if (qrData.startsWith('data:')) {
      throw new Error('Received image data instead of QR code string');
    }

    const bigInt = BigInt(qrData);
    const hex = bigInt.toString(16);
    const paddedHex = hex.length % 2 ? '0' + hex : hex;
    const bytes = [];
    for (let i = 0; i < paddedHex.length; i += 2) {
      bytes.push(parseInt(paddedHex.slice(i, i + 2), 16));
    }
    return new Uint8Array(bytes);
  } catch (e) {
    // If it fails as base10, try processing it as a regular string
    if (qrData.includes('ÿ')) {
      // If it already contains the delimiter, it might be already decoded
      const fields = qrData.split('ÿ');
      const dateMatch = fields.find(f => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/.test(f));
      if (dateMatch) {
        throw new Error('ALREADY_DECODED');
      }
    }
    throw new Error('Invalid QR data format');
  }
}

export async function parseAadhaarQr(qrData: string): Promise<AadhaarData> {
  try {
    // Parse XML format QR data
    if (qrData.startsWith('<?xml') || qrData.startsWith('<QPD')) {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        allowBooleanAttributes: true
      });
      
      const result = parser.parse(qrData);
      console.log('Parsed XML structure:', JSON.stringify(result, null, 2));
      
      if (qrData.startsWith('<?xml')) {
        const root = result.PrintLetterBarcodeData || {};
        return {
          name: root['@_name'] || '',
          gender: root['@_gender'] || '',
          dob: root['@_dob'] || '',
          address: [
            root['@_co'],
            root['@_lm'],
            root['@_loc'],
            root['@_vtc'],
            root['@_dist'],
            root['@_state'],
            root['@_pc'],
          ].filter(Boolean).join(', '),
          uid: root['@_uid'] || '',
          photo: null,
          issued_date: '',
          issued_time: '',
          mobile_number: ''
        };
      } else {
        const root = result.QPDA || result.QPDB || {};
        return {
          name: root['@_n'] || '',
          gender: root['@_g'] || '',
          dob: root['@_d'] || '',
          address: root['@_a'] || '',
          photo: root['@_i'] || null,
          uid: root['@_u'] || '',
          issued_date: '',
          issued_time: '',
          mobile_number: root['@_m'] || ''
        };
      }
    }

    // Process secure QR format
    try {
      const byteArray = convertBase10ToBytes(qrData);
      const decompressed = pako.inflate(byteArray);
      const decodedText = new TextDecoder('iso-8859-1').decode(decompressed);
      console.log('Decompressed text:', decodedText.substring(0, 100) + '...');

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
      if ((e as Error).message === 'ALREADY_DECODED') {
        // If the data is already decoded, parse it directly
        const fields = qrData.split('ÿ');
        const dateMatch = fields.find(f => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/.test(f));
        if (!dateMatch) {
          throw new Error('Invalid QR code format - no date field found');
        }

        const dateIndex = fields.indexOf(dateMatch);
        return {
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
      }
      console.error('Error processing secure QR format:', e);
      throw new Error('Invalid QR code format');
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
    throw new Error(`Failed to parse Aadhaar QR data: ${errorMessage}`);
  }
}