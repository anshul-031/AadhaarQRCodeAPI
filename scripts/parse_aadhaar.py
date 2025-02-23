import sys
import json
import base64
import cv2
import gzip
import xml.etree.ElementTree as ET
from pyzbar.pyzbar import decode
from PIL import Image
import numpy as np
import io

def decode_image(image_data):
    """Convert base64 image data to OpenCV format"""
    try:
        # Remove data URL prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]
            
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        
        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
            
        return img
    except Exception as e:
        raise ValueError(f"Failed to process image: {str(e)}")

def extract_qr_data(img):
    """Extracts raw QR data from the given image."""
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Try different thresholding methods
        methods = [
            lambda x: x,  # Original
            lambda x: cv2.threshold(x, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],  # Otsu's method
            lambda x: cv2.adaptiveThreshold(x, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)  # Adaptive
        ]
        
        for method in methods:
            processed = method(gray)
            qr_codes = decode(processed)
            
            if qr_codes:
                # Get first QR code data
                qr_data = qr_codes[0].data.decode("utf-8")
                return qr_data
                
        raise ValueError("No QR code detected in the image")
    except Exception as e:
        raise ValueError(f"Failed to extract QR data: {str(e)}")

def find_jp2_markers(byte_data):
    """Finds possible JPEG 2000 start markers in the given data."""
    markers = [
        b'\x00\x00\x00\x0C\x6A\x50\x20\x20',  # JP2 signature
        b'\xFF\x4F\xFF\x51',                   # JPEG 2000 codestream
        b'\xFF\xD8\xFF',                       # JPEG signature
        b'\x89\x50\x4E\x47\x0D\x0A\x1A\x0A'   # PNG signature
    ]
    
    for marker in markers:
        pos = byte_data.find(marker)
        if pos != -1:
            return pos, marker
    return None, None

def extract_aadhaar_photo(decompressed_data):
    """Extracts photo from QR data supporting multiple formats."""
    try:
        start_pos, marker = find_jp2_markers(decompressed_data)
        if start_pos is None:
            return None

        # Find end of image based on format
        if marker in [b'\xFF\xD8\xFF', b'\xFF\x4F\xFF\x51']:  # JPEG/JPEG2000
            end_pos = decompressed_data.find(b'\xFF\xD9', start_pos)
            if end_pos != -1:
                end_pos += 2
        elif marker == b'\x89\x50\x4E\x47':  # PNG
            # Find IEND chunk
            end_pos = decompressed_data.find(b'IEND', start_pos)
            if end_pos != -1:
                end_pos += 8
        else:
            # JP2 format
            end_pos = len(decompressed_data)

        if end_pos == -1:
            return None

        # Extract image data
        image_bytes = decompressed_data[start_pos:end_pos]
        
        # Try to decode and re-encode as JPEG for consistent frontend display
        try:
            # Convert to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                # Encode as JPEG
                _, buffer = cv2.imencode('.jpg', img)
                photo_base64 = base64.b64encode(buffer).decode('utf-8')
                return photo_base64
        except:
            # If conversion fails, return original bytes as base64
            return base64.b64encode(image_bytes).decode('utf-8')
            
        return None
    except Exception:
        return None

def parse_xml_qr_data_XML(xml_data):
    """Parses Aadhaar XML QR format"""
    try:
        root = ET.fromstring(xml_data)
        
        return {
            "success": True,
            "data": {
                "uid": root.get("uid", ""),
                "name": root.get("name", ""),
                "gender": root.get("gender", ""),
                "yob": root.get("yob", ""),
                "co": root.get("co", ""),
                "vtc": root.get("vtc", ""),
                "po": root.get("po", ""),
                "dist": root.get("dist", ""),
                "state": root.get("state", ""),
                "pc": root.get("pc", ""),
                "photo": None, 
                "raw_data": root
            }
        }
    except ET.ParseError as e:
        raise ValueError(f"Failed to parse XML data: {str(e)}")

def parse_xml_qr_data_QPDA(xml_data):
    """Parses Aadhaar XML QR format"""
    try:
        root = ET.fromstring(xml_data)
        
        return {
            "success": True,
            "data": {
                "uid": root.get("u", ""),
                "name": root.get("n", ""),
                "gender": root.get("g", ""),
                "dob": root.get("d", ""),
                "address": root.get("a", ""),
                "photo": root.get('i',''), 
                "signature": root.get('s',''),
                "raw_data": xml_data
            }
        }
    except ET.ParseError as e:
        raise ValueError(f"Failed to parse XML data: {str(e)}")


def convert_base10_to_bytes(qr_data):
    """Converts base10 string to byte array"""
    try:
        big_integer = int(qr_data)
        return big_integer.to_bytes((big_integer.bit_length() + 7) // 8, byteorder='big')
    except ValueError as e:
        raise ValueError(f"Invalid Base10 format: {str(e)}")

def decompress_qr_data(byte_array):
    """Decompresses the Aadhaar Secure QR byte array"""
    try:
        decompressed_data = gzip.decompress(byte_array)
        return decompressed_data
    except Exception as e:
        raise ValueError(f"Failed to decompress QR data: {str(e)}")

def parse_aadhaar_qr_data(decoded_text, photo_data=None):
    """Parses decompressed Aadhaar Secure QR data"""
    try:
        fields = decoded_text.split("ÿ")
        
        return {
            "success": True,
            "data": {
                "uid": "XXXX-XXXX-"+fields[2][:4],  # last 4 digit Masked Aadhaar number
                "name": fields[3],
                "issued_date": fields[2][10:12]+"/"+fields[2][8:10]+"/"+fields[2][4:8],
                "issued_time": fields[2][12:14]+":"+fields[2][14:16]+":"+fields[2][16:18],
                "gender": fields[5],
                "yob": fields[4].split("-")[2],  # Extract year from DOB
                "dob": fields[4],
                "mobile_number": fields[17],
                "email": fields[46],
                "co": fields[6],
                "house_no": fields[8],
                "vtc": fields[7],
                "po": "",  # Not available in secure QR
                "street": fields[10],
                "dist": fields[12],
                "state": fields[13],
                "pc": fields[11],
                "address": fields[6]+ ", " +fields[8]+ ", "+fields[10]+ ", "+fields[11]+ ", "+fields[12]+ ", "+fields[13], 
                "photo": photo_data, 
                "raw_data": fields
            }
        }
    except IndexError as e:
        raise ValueError(f"Failed to parse Aadhaar data: {str(e)}")

def process_qr_data(input_data):
    """Main function to process QR data from image or text"""
    try:
        # Check if input is an image (base64)
        if input_data.startswith(('data:image', 'iVBOR')):
            # Decode image and extract QR data
            img = decode_image(input_data)
            qr_data = extract_qr_data(img)
        else:
            # Use input directly as QR data
            qr_data = input_data

        # Check if it's XML format
        if qr_data.startswith("<?xml"):
            return parse_xml_qr_data_XML(qr_data)
            
        # Check if it's XML format
        if qr_data.startswith("<QPDA"):
            return parse_xml_qr_data_QPDA(qr_data)
            
        # Process as secure QR
        byte_array = convert_base10_to_bytes(qr_data)
        decompressed_data = decompress_qr_data(byte_array)
        
        # Try to extract photo
        photo_base64 = extract_aadhaar_photo(decompressed_data)
        
        # Parse text data
        return parse_aadhaar_qr_data(
            decompressed_data.decode('ISO-8859-1'),
            photo_base64
        )
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    """Entry point for command line execution"""
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        try:
            with open(input_file, 'r') as f:
                input_data = f.read().strip()
            result = process_qr_data(input_data)
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": f"Failed to read input file: {str(e)}"
            }))
    else:
        print(json.dumps({
            "success": False,
            "error": "No input file provided"
        }))

if __name__ == "__main__":
    main()