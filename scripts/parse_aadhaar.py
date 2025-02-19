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
        
        # Decode QR code
        qr_codes = decode(gray)
        
        if not qr_codes:
            raise ValueError("No QR code detected in the image")
            
        # Get first QR code data
        qr_data = qr_codes[0].data.decode("utf-8")
        return qr_data
    except Exception as e:
        raise ValueError(f"Failed to extract QR data: {str(e)}")

def parse_xml_qr_data(xml_data):
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
                "pc": root.get("pc", "")
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
        return decompressed_data.decode('ISO-8859-1')
    except Exception as e:
        raise ValueError(f"Failed to decompress QR data: {str(e)}")

def parse_aadhaar_qr_data(decoded_text):
    """Parses decompressed Aadhaar Secure QR data"""
    try:
        fields = decoded_text.split("ÿ")
        
        return {
            "success": True,
            "data": {
                "uid": fields[2],  # Masked Aadhaar number
                "name": fields[3],
                "gender": fields[5],
                "yob": fields[4].split("-")[0],  # Extract year from DOB
                "co": fields[6],
                "vtc": fields[7],
                "po": "",  # Not available in secure QR
                "dist": fields[10],
                "state": fields[13],
                "pc": fields[11]
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
            return parse_xml_qr_data(qr_data)
            
        # Process as secure QR
        byte_array = convert_base10_to_bytes(qr_data)
        decompressed_data = decompress_qr_data(byte_array)
        return parse_aadhaar_qr_data(decompressed_data)
        
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