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
import logging
import re

# Configure logging to write to stdout
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

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
        
        # Image enhancement methods
        enhancements = [
            lambda x: x,  # Original
            lambda x: cv2.GaussianBlur(x, (3, 3), 0),  # Slight blur for noise reduction
            lambda x: cv2.medianBlur(x, 3),  # Median blur for noise reduction
            lambda x: cv2.bilateralFilter(x, 9, 75, 75),  # Edge-preserving smoothing
            lambda x: cv2.fastNlMeansDenoising(x),  # Non-local means denoising
        ]

        # Thresholding methods
        thresholds = [
            lambda x: x,  # Original
            lambda x: cv2.threshold(x, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],  # Otsu's method
            lambda x: cv2.adaptiveThreshold(x, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2),  # Adaptive Gaussian
            lambda x: cv2.adaptiveThreshold(x, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 11, 2),  # Adaptive Mean
            lambda x: cv2.threshold(x, 127, 255, cv2.THRESH_BINARY)[1],  # Simple binary
        ]

        # Try different scales
        scales = [1.0, 1.5, 2.0, 0.75, 0.5]
        
        # Try different rotations
        rotations = [0, 90, 180, 270]

        # Process image with various combinations
        for scale in scales:
            # Resize image
            width = int(img.shape[1] * scale)
            height = int(img.shape[0] * scale)
            scaled = cv2.resize(gray, (width, height))

            for rotation in rotations:
                # Rotate image
                if rotation != 0:
                    matrix = cv2.getRotationMatrix2D((width/2, height/2), rotation, 1.0)
                    rotated = cv2.warpAffine(scaled, matrix, (width, height))
                else:
                    rotated = scaled

                for enhance in enhancements:
                    enhanced = enhance(rotated)
                    
                    for threshold in thresholds:
                        try:
                            processed = threshold(enhanced)
                            
                            # Additional contrast enhancement
                            processed = cv2.convertScaleAbs(processed, alpha=1.5, beta=0)
                            
                            # Sharpen the image
                            kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
                            processed = cv2.filter2D(processed, -1, kernel)
                            
                            qr_codes = decode(processed)
                            
                            if qr_codes:
                                # Get first QR code data
                                qr_data = qr_codes[0].data.decode("utf-8")
                                return qr_data
                        except Exception:
                            continue

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

    if xml_data.startswith("</?xml"):
        temp_xml_data = xml_data.replace("</?xml", "<?xml")
        root = ET.fromstring(temp_xml_data).attrib
    else:
        root = ET.fromstring(xml_data)
    try:
        return {
            "success": True,
            "data": {
                "uid": root.get("uid", ""),
                "name": root.get("name", ""),
                "gender": root.get("gender", ""),
                "dob": root.get("dob", ""),
                "address": root.get("co", "") + ", " + root.get("lm", "") + ", "+ root.get("loc", "") + ", " + root.get("vtc", "") + ", " + root.get("dist", "") + ", " + root.get("state", "") + ", " + root.get("pc", ""),
                "yob": root.get("yob", ""),
                "co": root.get("co", ""),
                "vtc": root.get("vtc", ""),
                "po": root.get("po", ""),
                "dist": root.get("dist", ""),
                "state": root.get("state", ""),
                "pc": root.get("pc", ""),
                "photo": None,
                "raw_data": xml_data
            }
        }
    except ET.ParseError as e:
        raise ValueError(f"Failed to parse XML data: {str(e)}")

def parse_xml_qr_data_QPD(xml_data):
    """Parses Aadhaar XML QR format"""
    try:
        root = ET.fromstring(xml_data)
        photo_base64 = root.get('i','')

        try:
            # Decode base64 image data
            image_bytes = base64.b64decode(photo_base64)
            # Convert to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            # Decode image
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is not None:
                # Encode as JPEG
                _, buffer = cv2.imencode('.jpg', img)
                photo_base64 = base64.b64encode(buffer).decode('utf-8')
            else:
                photo_base64 = None
        except Exception as e:
            logging.debug(f"Error processing image: {e}")
            photo_base64 = None

        return {
            "success": True,
            "data": {
                "uid": root.get("u", ""),
                "name": root.get("n", ""),
                "gender": root.get("g", ""),
                "dob": root.get("d", ""),
                "address": root.get("a", ""),
                "photo": photo_base64,
                "signature": root.get('s',''),
                "mobile": root.get('m',''),
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
        uid, name, issued_date, issued_time, gender, yob, dob, mobile_number, email, co, house_no, vtc, street, dist, state, pc = [""] * 16  # Initialize variables with default values
        date_field = None
        date_field_index = None

        # Iterate through fields to find a date
        for i, field in enumerate(fields):
            if re.match(r'\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-\d{2}-\d{4}', field):
                date_field = field
                date_field_index = i
                logging.debug(f"Found date field: {date_field} at index {date_field_index}")
                break  # Stop after the first date is found

        try:
            uid = "xxxxxxxx" + fields[date_field_index - 4 + 2][:4]  # last 4 digit Masked Aadhaar number
        except IndexError:
            logging.debug("Error extracting uid")
        try:
            name = fields[date_field_index - 4 + 3]
        except IndexError:
            logging.debug("Error extracting name")
        try:
            issued_date = fields[date_field_index - 4 + 2][10:12]+"/"+fields[date_field_index - 4 + 2][8:10]+"/"+fields[date_field_index - 4 + 2][4:8]
        except IndexError:
            logging.debug("Error extracting issued_date")
        try:
            issued_time = fields[date_field_index - 4 + 2][12:14]+":"+fields[date_field_index - 4 + 2][14:16]+":"+fields[date_field_index - 4 + 2][16:18]
        except IndexError:
            logging.debug("Error extracting issued_time")
        try:
            gender = fields[date_field_index - 4 + 5]
        except IndexError:
            logging.debug("Error extracting gender")
        try:
            dob = fields[date_field_index - 4 + 4]
        except IndexError:
            logging.debug("Error extracting dob")
        try:
            mobile_number = fields[date_field_index - 4 + 17]
        except IndexError:
            logging.debug("Error extracting mobile_number")
        try:
            email = fields[date_field_index - 4 + 46]
        except IndexError:
            logging.debug("Error extracting email")
        try:
            co = fields[date_field_index - 4 + 6]
        except IndexError:
            logging.debug("Error extracting co")
        try:
            house_no = fields[date_field_index - 4 + 8]
        except IndexError:
            logging.debug("Error extracting house_no")
        try:
            vtc = fields[date_field_index - 4 + 7]
        except IndexError:
            logging.debug("Error extracting vtc")
        try:
            street = fields[date_field_index - 4 + 10]
        except IndexError:
            logging.debug("Error extracting street")
        try:
            dist = fields[date_field_index - 4 + 12]
        except IndexError:
            logging.debug("Error extracting dist")
        try:
            state = fields[date_field_index - 4 + 13]
        except IndexError:
            logging.debug("Error extracting state")
        try:
            pc =  fields[date_field_index - 4 + 11]
        except IndexError:
            logging.debug("Error extracting pc")

        address = co+ ", " +house_no+ ", "+street+ ", "+pc+ ", "+dist+ ", "+state
        return {
            "success": True,
            "data": {
                "uid": uid,  # last 4 digit Masked Aadhaar number
                "name": name,
                "issued_date": issued_date,
                "issued_time": issued_time,
                "gender": gender,
                "yob": yob,  # Extract year from DOB
                "dob": dob,
                "mobile_number": mobile_number,
                "email": email,
                "co": co,
                "house_no": house_no,
                "vtc": vtc,
                "po": "",  # Not available in secure QR
                "street": street,
                "dist": dist,
                "state": state,
                "pc": pc,
                "address": address,
                "photo": photo_data,
                "raw_data": fields,
                "date_field_index": date_field_index
            }
        }
    except Exception as e:
        error_message = f"Failed to parse Aadhaar data: {str(e)} - Fields: {fields}"
        logging.debug(json.dumps({"success": False, "error": error_message}))
        return {"success": False, "error": error_message}

def process_qr_data(input_data):
    """Main function to process QR data from image or text"""
    try:
        logger.info("Starting QR data processing")
        
        logger.info("Input detected as base64 image")
        # Decode image and extract QR data
        img = decode_image(input_data)
        logger.debug("Image decoded successfully")
        qr_data = extract_qr_data(img)
        logger.info("QR code extracted from image")

        logger.debug(f"QR Data format check - Starts with: {qr_data[:10]}...")

        # Check if it's XML format
        if qr_data.startswith("<?xml") or qr_data.startswith("</?xml"):
            logger.info("Processing XML format QR data")
            return parse_xml_qr_data_XML(qr_data)

        # Check if it's QPD XML format
        if qr_data.startswith("<QPD"):
            logger.info("Processing QPD XML format QR data")
            return parse_xml_qr_data_QPD(qr_data)

        # Process as secure QR
        logger.info("Processing secure QR format")
        byte_array = convert_base10_to_bytes(qr_data)
        logger.debug("Converted base10 to bytes")
        
        decompressed_data = decompress_qr_data(byte_array)
        logger.debug("Data decompressed successfully")

        # Try to extract photo
        photo_base64 = extract_aadhaar_photo(decompressed_data)
        if photo_base64:
            logger.info("Photo extracted successfully")
        else:
            logger.info("No photo found in QR data")

        # Parse text data
        logger.info("Parsing Aadhaar text data")
        aadhaar_data = parse_aadhaar_qr_data(
            decompressed_data.decode('ISO-8859-1'),
            photo_base64
        )

        # Log result status
        if aadhaar_data["success"]:
            logger.info("QR data processed successfully")
        else:
            logger.error(f"QR data processing failed: {aadhaar_data.get('error', 'Unknown error')}")

        return aadhaar_data

    except Exception as e:
        logger.error(f"Error processing QR data: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }

def main():
    """Entry point for command line execution"""
    logger.info("Starting Aadhaar QR Code Parser")
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        logger.info(f"Processing input file: {input_file}")
        
        try:
            with open(input_file, 'r') as f:
                input_data = f.read().strip()
                logger.debug(f"Read {len(input_data)} characters from input file")
            
            logger.info("Processing QR data from input file")
            result = process_qr_data(input_data)
            
            if result["success"]:
                logger.info("Successfully processed QR data")
            else:
                logger.error(f"Failed to process QR data: {result.get('error', 'Unknown error')}")
            
            # Output final result as JSON
            print(json.dumps(result))
            
        except Exception as e:
            error_msg = f"Failed to read input file: {str(e)}"
            logger.error(error_msg, exc_info=True)
            print(json.dumps({
                "success": False,
                "error": error_msg
            }))
    else:
        error_msg = "No input file provided"
        logger.error(error_msg)
        print(json.dumps({
            "success": False,
            "error": error_msg
        }))
    
    logger.info("Aadhaar QR Code Parser finished")

if __name__ == "__main__":
    main()
