import os
import time
import sqlite3
from flask import Flask, jsonify, request

# Import our SQLite database manager
from database import db, DB_PATH

app = Flask(__name__)

# --- Global In-Memory Real-Time State ---
live_count = 0
plates_detected = 0
avg_speed = 0.0
active_alerts = 0
flow_status = "No Traffic"
last_update_time = 0.0

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
LIVE_STATS_JSON = os.path.join(PROJECT_DIR, "database", "live_stats.json")

def query_sqlite_metrics():
    """Queries the local SQLite database traffic_data.db directly to compute fresh, real metrics."""
    if not os.path.exists(DB_PATH):
        return {
            "plates_detected": 0,
            "avg_speed": 0.0,
            "active_alerts": 0,
            "total_count": 0
        }
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Unique license plates (excluding Unknown, Distant and empty placeholders)
        cursor.execute("""
            SELECT COUNT(DISTINCT license_plate) 
            FROM local_traffic_logs 
            WHERE license_plate IS NOT NULL 
              AND license_plate != 'Unknown' 
              AND license_plate != 'Unknown (Distant)' 
              AND license_plate != 'NOT_DETECTED'
              AND license_plate != ''
        """)
        unique_plates_count = cursor.fetchone()[0] or 0
        
        # 2. Average speed of all logged vehicles (using standard SQLite math)
        cursor.execute("SELECT AVG(speed_kmh) FROM local_traffic_logs")
        avg_speed_val = cursor.fetchone()[0]
        avg_speed_val = round(avg_speed_val, 1) if avg_speed_val is not None else 0.0
        
        # 3. Active alerts count (overspeeding > 60 km/h)
        cursor.execute("SELECT COUNT(*) FROM local_traffic_logs WHERE speed_kmh > 60.0")
        alert_count = cursor.fetchone()[0] or 0
        
        # 4. Total count of crossed vehicles
        cursor.execute("SELECT COUNT(*) FROM local_traffic_logs")
        total_count = cursor.fetchone()[0] or 0
        
        conn.close()
        return {
            "plates_detected": unique_plates_count,
            "avg_speed": avg_speed_val,
            "active_alerts": alert_count,
            "total_count": total_count
        }
    except Exception as e:
        print(f"Error querying SQLite metrics in Flask: {e}")
        return {
            "plates_detected": 0,
            "avg_speed": 0.0,
            "active_alerts": 0,
            "total_count": 0
        }

def get_live_metrics():
    """
    Fetches the live traffic metrics. Integrates live pipeline post variables
    with fresh values queried directly from the local traffic_data.db SQLite file.
    """
    global live_count, plates_detected, avg_speed, active_alerts, flow_status, last_update_time

    # Always fetch latest direct statistics from traffic_data.db
    sql_metrics = query_sqlite_metrics()
    
    # Check if we have an active video analysis pipeline session (updated in last 15 seconds)
    is_active_session = (time.time() - last_update_time < 15)

    if not is_active_session:
        # Check if live_stats.json was updated recently by the active Streamlit app process
        if os.path.exists(LIVE_STATS_JSON):
            try:
                mtime = os.path.getmtime(LIVE_STATS_JSON)
                if time.time() - mtime < 15:
                    import json
                    with open(LIVE_STATS_JSON, "r") as f:
                        stats = json.load(f)
                    
                    live_count = stats.get("live_count", 0)
                    avg_speed = stats.get("avg_speed", 0.0)
                    plates_detected = stats.get("plates_detected", 0)
                    active_alerts = stats.get("active_alerts", 0)
                    flow_status = stats.get("flow_status", "Stable Flow")
                    is_active_session = True
            except Exception:
                pass

    if is_active_session:
        # Zero Traffic Auto-Reset logic: if no vehicles on screen, reset live variables
        if live_count == 0:
            current_avg = 0.0
            current_alerts = 0
            current_flow = "No Traffic"
        else:
            current_avg = avg_speed
            current_alerts = active_alerts
            current_flow = flow_status
            
        # Overwrite database-wide counts onto the live metrics representation
        return {
            "live_count": live_count,
            "avg_speed": round(current_avg, 1),
            "plates_detected": sql_metrics["plates_detected"],
            "active_alerts": current_alerts, # Count of active alerts currently visible on frame
            "flow_status": current_flow
        }

    # Fallback/Default Mode: when video pipeline is idle or offline,
    # read directly from SQLite database and present aggregated historical summary
    if sql_metrics["total_count"] > 0:
        return {
            "live_count": 0, # Since no video is currently streaming/active
            "avg_speed": sql_metrics["avg_speed"],
            "plates_detected": sql_metrics["plates_detected"],
            "active_alerts": sql_metrics["active_alerts"],
            "flow_status": "Stable Flow"
        }

    # Absolute Clean Slate Fallback (No video, no SQLite logs found)
    # Serves as fallback to prevent dashboard from freezing or showing blank values
    return {
        "live_count": 0,
        "avg_speed": 0.0,
        "plates_detected": 0,
        "active_alerts": 0,
        "flow_status": "No Traffic"
    }

@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "Traffic Flow AI Flask Backend"})

@app.route("/api/analyze-feed", methods=["POST"])
def analyze_feed_endpoint():
    try:
        payload = request.get_json() or {}
        image_b64 = payload.get("image")
        if not image_b64:
            return jsonify({"error": "Missing image data"}), 400
            
        import base64
        import numpy as np
        import cv2
        
        # Decode base64 image
        img_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"error": "Failed to decode image"}), 400
            
        h_img, w_img = frame.shape[:2]
        
        from ultralytics import YOLO
        # Load standard yolov8n model. Will automatically download 6MB weight file if not present.
        model = YOLO('yolov8n.pt')
        results = model(frame, verbose=False)
        
        detections = []
        class_mapping = {
            2: "Car",
            3: "Motorcycle",
            5: "Bus",
            7: "Truck",
            1: "Bicycle"
        }
        
        reader = None
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0].item())
                if cls_id in class_mapping:
                    conf = float(box.conf[0].item())
                    # Only accept confident detections
                    if conf < 0.25:
                        continue
                        
                    xyxy = box.xyxy[0].tolist()
                    x1, y1, x2, y2 = xyxy
                    
                    # Convert to percentage relative coordinates (0-100)
                    ymin = max(0, min(100, int((y1 / h_img) * 100)))
                    xmin = max(0, min(100, int((x1 / w_img) * 100)))
                    ymax = max(0, min(100, int((y2 / h_img) * 100)))
                    xmax = max(0, min(100, int((x2 / w_img) * 100)))
                    
                    crop_x1 = max(0, int(x1))
                    crop_y1 = max(0, int(y1))
                    crop_x2 = min(w_img, int(x2))
                    crop_y2 = min(h_img, int(y2))
                    
                    vehicle_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                    
                    # Compute realistic dominant color in HSV/RGB space
                    color_detected = "Gray"
                    if vehicle_crop.size > 0:
                        try:
                            avg_bgr = cv2.mean(vehicle_crop)[:3]
                            b, g, r = avg_bgr
                            max_val = max(r, g, b)
                            min_val = min(r, g, b)
                            diff = max_val - min_val
                            
                            if max_val < 55:
                                color_detected = "Black"
                            elif min_val > 210:
                                color_detected = "White"
                            elif diff < 20:
                                if max_val > 150:
                                    color_detected = "Silver"
                                else:
                                    color_detected = "Gray"
                            else:
                                if r > g and r > b:
                                    color_detected = "Red"
                                elif g > r and g > b:
                                    color_detected = "Green"
                                elif b > r and b > g:
                                    color_detected = "Blue"
                                elif r > 140 and g > 140 and b < 100:
                                    color_detected = "Yellow"
                                else:
                                    color_detected = "Gray"
                        except Exception:
                            pass
                            
                    # Refine vehicle details
                    v_type = class_mapping[cls_id]
                    brand_detected = v_type
                    if v_type == "Car":
                        aspect_ratio = (crop_y2 - crop_y1) / (crop_x2 - crop_x1 + 1e-5)
                        if aspect_ratio > 0.72:
                            brand_detected = "SUV"
                            v_type = "SUV"
                        else:
                            brand_detected = "Sedan"
                    elif v_type == "Truck":
                        brand_detected = "Heavy Truck"
                    elif v_type == "Bus":
                        brand_detected = "Coach Bus"
                        
                    # Plate OCR (optional / lazy loading of easyocr)
                    plate_text = ""
                    if vehicle_crop.size > 0:
                        try:
                            vh, vw = vehicle_crop.shape[:2]
                            # Bounding box of plate is usually in the bottom 45% of the vehicle
                            plate_area_y1 = int(vh * 0.55)
                            plate_region = vehicle_crop[plate_area_y1:vh, 0:vw]
                            
                            if plate_region.size > 0:
                                if reader is None:
                                    import easyocr
                                    import torch
                                    reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
                                ocr_results = reader.readtext(plate_region)
                                if ocr_results:
                                    for ocr_res in ocr_results:
                                        text = ocr_res[1]
                                        conf_score = ocr_res[2]
                                        if conf_score > 0.35:
                                            clean_text = "".join(c for c in text if c.isalnum()).upper()
                                            if len(clean_text) >= 4 and len(clean_text) <= 12:
                                                plate_text = clean_text
                                                break
                        except Exception as e:
                            print(f"Skipping OCR trace: {e}")
                            
                    detections.append({
                        "type": v_type,
                        "plate": plate_text or "N/A",
                        "confidence": int(conf * 100) if conf <= 1 else int(conf),
                        "color": color_detected,
                        "brand": brand_detected,
                        "box": {
                            "ymin": ymin,
                            "xmin": xmin,
                            "ymax": ymax,
                            "xmax": xmax
                        }
                    })
                    
        return jsonify({"detections": detections, "fallbackUsed": False})
    except Exception as e:
        print(f"Error in python analyze-feed endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/stats", methods=["GET"])
def stats_endpoint():
    """Returns a JSON payload with live_count, avg_speed, plates_detected, active_alerts, and flow_status."""
    return jsonify(get_live_metrics())

@app.route("/api/traffic-metrics", methods=["GET"])
def traffic_metrics_endpoint():
    """Flask background endpoint specifically serving live variables dynamically to the front-end proxy."""
    return jsonify(get_live_metrics())

@app.route("/api/metrics", methods=["GET"])
def get_metrics_endpoint():
    """Returns live metrics directly on the /api/metrics GET endpoint."""
    return jsonify(get_live_metrics())

@app.route("/api/metrics", methods=["POST"])
@app.route("/api/update-metrics", methods=["POST"])
def update_metrics():
    """Allows the tracking pipeline to post real-time updates directly to global variables."""
    global live_count, plates_detected, avg_speed, active_alerts, flow_status, last_update_time
    
    payload = request.get_json() or {}
    
    live_count = int(payload.get("live_count", 0))
    plates_detected = int(payload.get("plates_detected", 0))
    avg_speed = float(payload.get("avg_speed", 0.0))
    active_alerts = int(payload.get("active_alerts", 0))
    flow_status = str(payload.get("flow_status", "No Traffic"))
    last_update_time = time.time()
    
    # Zero Traffic Auto-Reset Handled here for incoming pipeline data
    if live_count == 0:
        avg_speed = 0.0
        active_alerts = 0
        flow_status = "No Traffic"
        plates_detected = 0

    # Persist to live_stats.json for secondary syncing
    try:
        db_dir = os.path.dirname(LIVE_STATS_JSON)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir)
        import json
        with open(LIVE_STATS_JSON, "w") as f:
            json.dump({
                "live_count": live_count,
                "avg_speed": avg_speed,
                "plates_detected": plates_detected,
                "active_alerts": active_alerts,
                "flow_status": flow_status
            }, f)
    except Exception as e:
        pass
        
    return jsonify({"status": "success", "message": "Metrics updated successfully"})

if __name__ == "__main__":
    # Start the Flask server on port 5000 (proxied by Node server on port 3000)
    print("Launching Flask application from main.py...")
    app.run(host="127.0.0.1", port=5000, debug=False)
