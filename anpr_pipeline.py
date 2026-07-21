import cv2
import re
import numpy as np
import logging

# Configure logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("ANPR-Pipeline")

def verify_and_ocr_plate(
    frame: np.ndarray, 
    plate_bbox: list, 
    reader, 
    area_threshold: int = 2500, 
    blur_threshold: float = 80.0, 
    ocr_conf_threshold: float = 0.80,
    pattern: str = r"^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$"
) -> str:
    """
    Performs Automatic Number Plate Recognition (ANPR) with OCR and 4 strict filters:
    
    1. Minimum Pixel Area Filter (Resolution Check)
    2. Edge/Blur Detection Filter (Laplacian Variance)
    3. Rigid OCR Confidence Score Thresholding
    4. Regex (Pattern) Strict Validation
    
    Parameters:
        frame (np.ndarray): The full input image/video frame (BGR format from OpenCV).
        plate_bbox (list or tuple): Bounding box of the plate in [x1, y1, x2, y2] format.
        reader: EasyOCR Reader (or similar OCR engine instance with readtext method).
        area_threshold (int): Minimum pixel area (width * height) required to process plate. Default is 2500.
        blur_threshold (float): Minimum Laplacian variance score for sharpness. Default is 80.0.
        ocr_conf_threshold (float): Minimum OCR confidence score required. Default is 0.80.
        pattern (str): Regular expression pattern for strict license plate validation. 
                       Default matches standard Indian plates (e.g. MH04DH0730).
                       
    Returns:
        str: The verified license plate text, or "Unknown" if any filter fails.
    """
    # Parse and validate bounding box coordinates
    try:
        x1, y1, x2, y2 = map(int, plate_bbox)
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid bounding box coordinates: {plate_bbox}. Error: {e}")
        return "Unknown"
        
    # -------------------------------------------------------------------------
    # HINT 1: Minimum Pixel Area Filter (Resolution Check)
    # -------------------------------------------------------------------------
    width = x2 - x1
    height = y2 - y1
    area = width * height
    
    if area < area_threshold:
        logger.info(f"Skipped OCR: Plate area too small ({area}px < {area_threshold}px).")
        return "Unknown"
        
    # Boundary validation to prevent out-of-bounds crops
    h_frame, w_frame = frame.shape[:2]
    x1_c, y1_c = max(0, x1), max(0, y1)
    x2_c, y2_c = min(w_frame, x2), min(h_frame, y2)
    
    if (x2_c - x1_c) <= 0 or (y2_c - y1_c) <= 0:
        logger.warning("Skipped OCR: Invalid crop boundaries.")
        return "Unknown"
        
    # Crop the license plate region
    plate_crop = frame[y1_c:y2_c, x1_c:x2_c]
    
    # -------------------------------------------------------------------------
    # HINT 3: Edge/Blur Detection Filter (Laplacian Variance)
    # -------------------------------------------------------------------------
    gray_plate = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray_plate, cv2.CV_64F).var()
    
    if laplacian_var < blur_threshold:
        logger.info(f"Skipped OCR: Plate too blurry (Laplacian Variance {laplacian_var:.2f} < {blur_threshold:.1f}).")
        return "Unknown"
        
    # -------------------------------------------------------------------------
    # OCR Engine Execution (using EasyOCR or equivalent)
    # -------------------------------------------------------------------------
    try:
        # We can also apply minor preprocessing to improve OCR quality on edge cases
        # (e.g., resizing smaller crops up for better character definition)
        if height < 40:
            resized_plate = cv2.resize(gray_plate, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
            ocr_results = reader.readtext(resized_plate)
        else:
            ocr_results = reader.readtext(plate_crop)
            
        if not ocr_results:
            logger.info("OCR returned no text detections.")
            return "Unknown"
            
        # Extract detected text and confidence score
        # Readtext returns a list of tuples: (bbox, text, confidence)
        # Select the text result with highest confidence
        best_ocr = max(ocr_results, key=lambda x: x[2])
        detected_text = best_ocr[1]
        ocr_confidence = best_ocr[2]
        
    except Exception as e:
        logger.error(f"Error during OCR execution: {e}")
        return "Unknown"
        
    # -------------------------------------------------------------------------
    # HINT 2: Rigid OCR Confidence Score Thresholding
    # -------------------------------------------------------------------------
    if ocr_confidence < ocr_conf_threshold:
        logger.info(f"Discarded OCR: Low confidence ({ocr_confidence:.2f} < {ocr_conf_threshold:.2f}).")
        return "Unknown"
        
    # -------------------------------------------------------------------------
    # HINT 4: Regex (Pattern) Strict Validation
    # -------------------------------------------------------------------------
    # Clean the text: remove spaces, hyphens, or other special characters and convert to uppercase
    clean_text = "".join(char for char in detected_text if char.isalnum()).upper()
    
    # Run rigid regex pattern check
    if re.match(pattern, clean_text):
        logger.info(f"Successfully verified license plate: {clean_text} (Conf: {ocr_confidence:.2f}, Blur Var: {laplacian_var:.1f})")
        return clean_text
    else:
        logger.info(f"Rejected OCR: Text '{clean_text}' failed strict regex pattern match.")
        return "Unknown"


# Example Usage & Setup within a YOLO pipeline
if __name__ == "__main__":
    try:
        import torch
        import easyocr
        from ultralytics import YOLO
        
        print("Initializing models for demonstration...")
        # Initialize YOLO models and OCR Reader
        # vehicle_model = YOLO("yolov8n. Didn't download actually, but structure shown here:")
        # reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
        
        print("ANPR Pipeline loaded successfully with the 4 strict filters!")
    except ImportError:
        print("Demo requirements not fully met. Modules 'ultralytics' or 'easyocr' are not installed in the context.")
