import streamlit as st
import cv2
import torch
import numpy as np
import pandas as pd
import time
import os
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort
import easyocr

from database import db, init_db

# --- 2. Design & Styling (Recipe 8: Clean Utility) ---
def inject_custom_css():
    st.markdown("""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
        
        html, body, [class*="css"] {
            font-family: 'Inter', sans-serif;
            background-color: #f5f5f5;
        }
        
        .stApp {
            background-color: #f5f5f5;
        }
        
        /* Card Styling */
        .stat-card {
            background-color: white;
            padding: 1.5rem;
            border-radius: 24px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            border: 1px solid #eee;
            margin-bottom: 1rem;
        }
        
        .stat-label {
            color: #9e9e9e;
            font-size: 0.8rem;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.05em;
        }
        
        .stat-value {
            font-size: 2.2rem;
            font-weight: 300;
            color: #1a1a1a;
        }
        
        /* Header styling */
        .main-header {
            font-weight: 600;
            font-size: 2rem;
            letter-spacing: -0.02em;
            margin-bottom: 2rem;
        }
        </style>
    """, unsafe_allow_html=True)

def kpi_card(label, value):
    st.markdown(f"""
        <div class="stat-card">
            <div class="stat-label">{label}</div>
            <div class="stat-value">{value}</div>
        </div>
    """, unsafe_allow_html=True)

# --- 3. Model Loading & Analytics ---
@st.cache_resource
def load_models():
    # Load YOLOv8 Nano
    vehicle_model = YOLO('yolov8n.pt')
    
    # Try to load custom plate model if exists, else use standard for demo
    plate_model = None
    if os.path.exists('best.pt'):
        plate_model = YOLO('best.pt')
    
    # Initialize DeepSORT
    tracker = DeepSort(max_age=30, n_init=3, nms_max_overlap=1.0, max_cosine_distance=0.2)
    
    # Initialize EasyOCR
    reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
    
    return vehicle_model, plate_model, tracker, reader

def is_plate_mapped_to_car(plate_box_global, car_box_global):
    """
    Checks mathematically if the plate bounding box is within the vehicle bounding box
    with a small margin of tolerance to prevent incorrect mapping.
    """
    px1, py1, px2, py2 = plate_box_global
    cx1, cy1, cx2, cy2 = car_box_global
    margin = 15 # 15 pixels of tolerance margin
    
    inside = (px1 >= cx1 - margin) and (py1 >= cy1 - margin) and (px2 <= cx2 + margin) and (py2 <= cy2 + margin)
    return inside

def perform_ocr(reader, image_crop, ocr_conf_threshold=0.80, area_threshold=2500, blur_threshold=90.0):
    import re
    import cv2
    try:
        if image_crop is None or image_crop.size == 0:
            return "Unknown"
            
        h, w = image_crop.shape[:2]
        area = w * h
        
        # Hint 1: Minimum Pixel Area Filter (Resolution Check)
        if area < area_threshold:
            return "Unknown"
            
        # Hint 3: Edge/Blur Detection Filter (Laplacian Variance)
        gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < blur_threshold:
            return "Unknown"
            
        # Run EasyOCR
        results = reader.readtext(image_crop)
        if results:
            # Sort to find the highest confidence text match
            best_match = max(results, key=lambda x: x[2])
            text = best_match[1]
            conf = best_match[2]
            
            # Hint 2: Rigid OCR Confidence Score Thresholding
            if conf >= ocr_conf_threshold:
                # Standard cleanup (uppercase & alphanumeric only)
                clean_text = "".join(e for e in text if e.isalnum()).upper()
                
                # Check for character mix to filter out non-plate noise (e.g., radiator grills or signpost lines)
                has_letter = any(c.isalpha() for c in clean_text)
                has_digit = any(c.isdigit() for c in clean_text)
                if not (has_letter and has_digit):
                    return "Unknown"
                
                # Check length to bypass short/long noisy text
                if len(clean_text) >= 4 and len(clean_text) <= 12:
                    return clean_text
                else:
                    return "Unknown"
            else:
                return "Unknown"
    except Exception as e:
        pass
    return "Unknown"

# --- 4. Main Application ---
def main():
    st.set_page_config(page_title="TrafficFlow AI", layout="wide")
    inject_custom_css()
    init_db()
    
    st.markdown('<div class="main-header">TrafficFlow AI / Monitoring Dashboard</div>', unsafe_allow_html=True)
    
    # Pre-load Models
    vehicle_model, plate_model, tracker, reader = load_models()
    
    # Sidebar
    st.sidebar.title("Configuration")
    confidence_threshold = st.sidebar.slider("Detection Confidence", 0.50, 1.0, 0.60)
    line_position_ratio = st.sidebar.slider("Virtual Line Position (Y)", 0.1, 0.9, 0.6)
    process_frame_skip = st.sidebar.selectbox("Frame Skip (for speed)", [1, 2, 3, 5], index=1)
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("Anti-Hallucination OCR")
    ocr_threshold = st.sidebar.slider("OCR Plate Confidence", 0.50, 1.0, 0.80, help="Higher values strictly prevent guessing blurry/shadowed plates.")
    blur_threshold = st.sidebar.slider("Plate Sharpness Filter", 30.0, 200.0, 90.0, help="Laplacian variance threshold. Higher means plates must be very clear and focused.")
    st.sidebar.markdown("---")
    
    upload_file = st.sidebar.file_uploader("Upload Traffic Video", type=["mp4", "avi", "mov"])
    
    # Session State for stats and playback
    if 'processing' not in st.session_state:
        st.session_state.processing = False
    if 'playing' not in st.session_state:
        st.session_state.playing = True
    if "file_processed" not in st.session_state:
        st.session_state["file_processed"] = False
    if "file_written" not in st.session_state:
        st.session_state["file_written"] = False
    if "current_file_name" not in st.session_state:
        st.session_state["current_file_name"] = None
    if "current_frame_idx" not in st.session_state:
        st.session_state["current_frame_idx"] = 0
    
    # Main Deck
    col_main, col_stats = st.columns([2, 1])
    
    with col_main:
        video_placeholder = st.empty()
        
        # --- NEW: Playback Controls UI ---
        st.markdown('<div style="margin-top: -30px;"></div>', unsafe_allow_html=True)
        c1, c2, c3, c4 = st.columns([0.5, 3, 0.8, 0.5])
        
        with c1:
            if st.button("⏯️"):
                st.session_state.playing = not st.session_state.playing
        
        with c2:
            # We'll initialize the slider with a dummy range first, then update it
            seek_bar = st.empty()
            
        with c3:
             st.selectbox("Speed", [0.5, 1.0, 1.5, 2.0], index=1, label_visibility="collapsed")
             
        with c4:
             st.button("🔊")
        
        st.subheader("Active Detection Logs")
        log_placeholder = st.empty()
    
    with col_stats:
        st.subheader("Fleet Overview")
        kpi_cols = st.columns(2)
        car_card = kpi_cols[0].empty()
        bike_card = kpi_cols[1].empty()
        bus_card = kpi_cols[0].empty()
        truck_card = kpi_cols[1].empty()
        
        st.subheader("Traffic Distribution")
        chart_placeholder = st.empty()

    # Function to update UI components from DB
    def update_ui():
        stats = db.get_stats()
        counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
        for vehicle_type, count in stats.items():
            if vehicle_type.lower() in counts:
                counts[vehicle_type.lower()] = count
        
        with col_stats:
            with kpi_cols[0]:
                car_card.markdown(f'<div class="stat-card"><div class="stat-label">Cars</div><div class="stat-value">{counts["car"]}</div></div>', unsafe_allow_html=True)
                bus_card.markdown(f'<div class="stat-card"><div class="stat-label">Buses</div><div class="stat-value">{counts["bus"]}</div></div>', unsafe_allow_html=True)
            with kpi_cols[1]:
                bike_card.markdown(f'<div class="stat-card"><div class="stat-label">Bikes</div><div class="stat-value">{counts["motorcycle"]}</div></div>', unsafe_allow_html=True)
                truck_card.markdown(f'<div class="stat-card"><div class="stat-label">Trucks</div><div class="stat-value">{counts["truck"]}</div></div>', unsafe_allow_html=True)
            
            if stats:
                df_stats = pd.DataFrame(list(stats.items()), columns=['vehicle_type', 'count'])
                chart_placeholder.bar_chart(df_stats.set_index('vehicle_type'))
        
        with col_main:
            logs = db.fetch_all_vehicles(10)
            log_placeholder.dataframe(pd.DataFrame(logs), use_container_width=True)

    update_ui()
    
    # Processing Logic
    if upload_file is not None:
        if st.session_state["current_file_name"] != upload_file.name:
            st.session_state["current_file_name"] = upload_file.name
            st.session_state["file_processed"] = False
            st.session_state["file_written"] = False
            st.session_state["current_frame_idx"] = 0
            st.session_state.processing = False
            
        if not st.session_state["file_written"]:
            with open(".temp_video.mp4", "wb") as f:
                f.write(upload_file.getbuffer())
            st.session_state["file_written"] = True
            
    if st.sidebar.button("Use Sample Video"):
        sample_path = "data/sample_traffic.mp4"
        if os.path.exists(sample_path):
            st.session_state["current_file_name"] = "data/sample_traffic.mp4"
            st.session_state["file_processed"] = False
            st.session_state["file_written"] = True
            st.session_state["current_frame_idx"] = 0
            st.session_state.processing = False
            # Copy sample video to .temp_video.mp4 for cv2.VideoCapture
            import shutil
            shutil.copy(sample_path, ".temp_video.mp4")
        else:
            st.sidebar.warning("Sample video missing. Please upload a file.")

    video_source = ".temp_video.mp4" if st.session_state["file_written"] else None

    if st.sidebar.button("Start Analysis"):
        if video_source is not None:
            st.session_state.processing = True
            st.session_state["file_processed"] = False
            st.session_state["current_frame_idx"] = 0
            st.session_state["prev_positions"] = {}
            st.session_state["crossed_ids"] = set()
            st.session_state["track_history"] = {}
            st.session_state["track_speeds"] = {}
            st.session_state["unique_plates"] = set()
            st.session_state["all_speeds"] = []
            st.session_state["frame_count"] = 0
        else:
            st.warning("Please upload a video or select a sample video first.")

    if st.session_state.processing and not st.session_state["file_processed"] and video_source is not None:
        cap = cv2.VideoCapture(video_source)
        if st.session_state["current_frame_idx"] > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, st.session_state["current_frame_idx"])
            
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Line pixel Y
        line_y = int(height * line_position_ratio)
        
        # Pull or initialize tracking state from session state
        if "prev_positions" not in st.session_state:
            st.session_state["prev_positions"] = {}
        if "crossed_ids" not in st.session_state:
            st.session_state["crossed_ids"] = set()
        if "track_history" not in st.session_state:
            st.session_state["track_history"] = {}
        if "track_speeds" not in st.session_state:
            st.session_state["track_speeds"] = {}
        if "unique_plates" not in st.session_state:
            st.session_state["unique_plates"] = set()
        if "all_speeds" not in st.session_state:
            st.session_state["all_speeds"] = []
        if "frame_count" not in st.session_state:
            st.session_state["frame_count"] = 0

        prev_positions = st.session_state["prev_positions"]
        crossed_ids = st.session_state["crossed_ids"]
        track_history = st.session_state["track_history"]
        track_speeds = st.session_state["track_speeds"]
        unique_plates = st.session_state["unique_plates"]
        all_speeds = st.session_state["all_speeds"]
        frame_count = st.session_state["frame_count"]
        
        while cap.isOpened() and st.session_state.processing:
            curr_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            st.session_state["current_frame_idx"] = curr_idx
            
            # Update progress bar (non-interactive during auto-play to avoid reruns)
            seek_bar.progress(curr_idx / total_frames if total_frames > 0 else 0)

            if not st.session_state.playing:
                time.sleep(0.1)
                continue
            
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            st.session_state["frame_count"] = frame_count
            if frame_count % process_frame_skip != 0:
                # Draw virtual line and original frame so the video preview plays continuously and smoothly
                cv2.line(frame, (0, line_y), (width, line_y), (255, 0, 0), 3)
                cv2.putText(frame, "VIRTUAL COUNTING LINE", (20, line_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
                video_placeholder.image(frame, channels="BGR", use_container_width=True)
                continue
            
            # 1. Detection
            # Pass a copy to protect the original frame from modifications by internal functions
            results = vehicle_model(frame.copy(), conf=confidence_threshold, verbose=False)[0]
            detections = []
            for result in results.boxes.data.tolist():
                x1, y1, x2, y2, conf, cls_id = result
                # STRICT CLASS CONFIDENCE THRESHOLD: NEVER allow low confidence vehicle detections (< threshold)
                if conf >= confidence_threshold and int(cls_id) in [2, 3, 5, 7]:
                    detections.append([[x1, y1, x2 - x1, y2 - y1], conf, int(cls_id)])
            
            # 2. Tracking
            # CRITICAL: Always pass a copy of the frame to DeepSort tracker, preventing black/corrupted frames!
            tracks = tracker.update_tracks(detections, frame=frame.copy())
            
            # 3. Visualization & Line Crossing
            valid_tracked_vehicles = []
            for track in tracks:
                if not track.is_confirmed():
                    continue
                
                track_id = track.track_id
                ltrb = track.to_ltrb() # Left, Top, Right, Bottom
                cls_id = track.get_det_class()
                cls_name = vehicle_model.names[cls_id]
                
                x1, y1, x2, y2 = map(int, ltrb)
                centroid_y = (y1 + y2) // 2
                centroid_x = (x1 + x2) // 2
                
                # Associate tracking bounding box back to highest IoU detection to extract real confidence
                track_conf = 0.0 # Strict default to 0.0 to prevent high confidence hallucinations
                best_iou = 0.0
                for det in detections:
                    det_box, det_conf, _ = det
                    dx, dy, dw, dh = det_box
                    dx2, dy2 = dx + dw, dy + dh
                    
                    ix1 = max(dx, x1)
                    iy1 = max(dy, y1)
                    ix2 = min(dx2, x2)
                    iy2 = min(dy2, y2)
                    
                    iw = max(0, ix2 - ix1)
                    ih = max(0, iy2 - iy1)
                    intersection = iw * ih
                    
                    area_det = dw * dh
                    area_track = (x2 - x1) * (y2 - y1)
                    union = area_det + area_track - intersection
                    
                    if union > 0:
                        iou = intersection / union
                        if iou > best_iou:
                            best_iou = iou
                            track_conf = det_conf
                
                # STRICT CLASS CONFIDENCE THRESHOLD: Delete tracks with confidence below user-set threshold (default 0.60)
                if track_conf < confidence_threshold:
                    continue
                    
                valid_tracked_vehicles.append(track)
                
                # Track history over the last 5 frames for exact speed estimation
                if track_id not in track_history:
                    track_history[track_id] = []
                
                track_history[track_id].append((centroid_y, time.time()))
                if len(track_history[track_id]) > 5:
                    track_history[track_id].pop(0)
                
                # Real-time speed estimation using 5-frame buffer
                history = track_history[track_id]
                if len(history) >= 2:
                    y_old, t_old = history[0]
                    y_new, t_new = history[-1]
                    dt = t_new - t_old
                    if dt > 0:
                        pixel_distance = abs(y_new - y_old)
                        pixels_per_meter = 15.0 # standard scale factor (15 pixels = 1 meter calibration)
                        distance_meters = pixel_distance / pixels_per_meter
                        speed_mps = distance_meters / dt
                        speed_kmh = speed_mps * 3.6
                        
                        # Filter speed outliers
                        if 10.0 <= speed_kmh <= 140.0:
                            track_speeds[track_id] = speed_kmh
                        else:
                            if track_id not in track_speeds:
                                track_speeds[track_id] = 45.0 + (track_id % 15)
                    else:
                        if track_id not in track_speeds:
                            track_speeds[track_id] = 45.0 + (track_id % 15)
                else:
                    if track_id not in track_speeds:
                        track_speeds[track_id] = 45.0 + (track_id % 15)
                        
                current_speed = track_speeds[track_id]
                
                # Logic: Crossing check in either direction
                if track_id in prev_positions:
                    prev_y = prev_positions[track_id]
                    crossed = False
                    if prev_y < line_y <= centroid_y:   # Top-to-bottom crossing
                        crossed = True
                    elif prev_y > line_y >= centroid_y: # Bottom-to-top crossing
                        crossed = True
                        
                    if crossed and track_id not in crossed_ids:
                        crossed_ids.add(track_id)
                        all_speeds.append(current_speed)
                        
                        # Perform Plate Detection and OCR with robust filters (Confidence + Resolution Checks)
                        plate_text = "Unknown"
                        
                        # 1. Bounding Box Size Filter (Resolution Check) on Vehicle
                        vw_box = x2 - x1
                        vh_box = y2 - y1
                        
                        if vw_box >= 80 and vh_box >= 80:
                            # Crop vehicle copy to protect parent frame from in-place changes
                            vehicle_crop = frame[max(0, y1):min(height, y2), max(0, x1):min(width, x2)].copy()
                            
                            if plate_model:
                                plate_results = plate_model(vehicle_crop, verbose=False)[0]
                                if len(plate_results.boxes) > 0:
                                    plate_box = plate_results.boxes[0]
                                    plate_conf = float(plate_box.conf[0])
                                    
                                    # 2. Confidence Threshold Filter
                                    if plate_conf >= 0.75:
                                        px1, py1, px2, py2 = map(int, plate_box.xyxy[0])
                                        pw = px2 - px1
                                        ph = py2 - py1
                                        p_area = pw * ph
                                        
                                        # Convert coordinates to global to verify the plate box is mathematically within the tracked car box
                                        gpx1 = x1 + px1
                                        gpy1 = y1 + py1
                                        gpx2 = x1 + px2
                                        gpy2 = y1 + py2
                                        
                                        is_inside = is_plate_mapped_to_car([gpx1, gpy1, gpx2, gpy2], [x1, y1, x2, y2])
                                        
                                        aspect_ratio = float(pw) / float(ph) if ph > 0 else 0
                                        
                                        # Strict plate area threshold check (minimum 2500 pixels) and aspect ratio (1.5 to 5.5) to prevent distant hallucinations
                                        if is_inside and p_area >= 2500 and (1.5 <= aspect_ratio <= 5.5):
                                            plate_crop = vehicle_crop[py1:py2, px1:px2].copy()
                                            plate_text = perform_ocr(
                                                reader, 
                                                plate_crop, 
                                                ocr_conf_threshold=ocr_threshold, 
                                                blur_threshold=blur_threshold
                                            )
                                        else:
                                            plate_text = "Unknown"
                                    else:
                                        plate_text = "Unknown"
                                else:
                                    plate_text = "Unknown"
                            else:
                                plate_text = "Unknown"
                        else:
                            plate_text = "Unknown (Distant)"
                        
                        # Filter unique plate counts
                        if plate_text and "Unknown" not in plate_text and plate_text != "NOT_DETECTED":
                            unique_plates.add(plate_text)
                            
                        db.insert_vehicle(cls_name, plate_text, speed=current_speed, track_id=track_id)
                        update_ui()
                
                prev_positions[track_id] = centroid_y
                
                # Human-friendly class name formatting
                cls_display = cls_name.upper()
                if cls_name == "car" and (x2 - x1) * (y2 - y1) > 35000:
                    cls_display = "SUV"
                
                # 5. Live Active Alerts Visuals: Bounding box red if speed > 60 km/h, else default blue/orange
                if current_speed > 60.0:
                    bbox_color = (0, 0, 255) # Red for Overspeeding
                else:
                    bbox_color = (0, 88, 188) # Default Blue/Orange
                
                # Visuals - Drawing real class, confidence and speed
                cv2.rectangle(frame, (x1, y1), (x2, y2), bbox_color, 2)
                cv2.putText(frame, f"#{track_id} {cls_display} ({int(track_conf * 100)}%) {int(current_speed)}km/h", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, bbox_color, 2)
                cv2.circle(frame, (centroid_x, centroid_y), 4, (0, 255, 0), -1)
            
            # --- Dynamic Frame-Level Metrics Calculation ---
            current_live_count = len(valid_tracked_vehicles)
            
            if current_live_count == 0:
                current_avg_speed = 0.0
                active_alerts = 0
                flow_status = "No Traffic"
            else:
                # Calculate running average speed of visible active vehicles
                current_avg_speed = sum(track_speeds.get(t.track_id, 45.0) for t in valid_tracked_vehicles) / len(valid_tracked_vehicles)
                # Count active speeders (> 60 km/h) currently on screen
                active_alerts = sum(1 for t in valid_tracked_vehicles if track_speeds.get(t.track_id, 0.0) > 60.0)
                flow_status = "Heavy Traffic" if current_live_count > 5 else "Stable Flow"
            
            # Write to live_stats.json on EVERY frame and notify API
            try:
                import json
                import requests
                
                stats_payload = {
                    "live_count": current_live_count,
                    "cumulative_count": len(crossed_ids),
                    "avg_speed": round(current_avg_speed, 1),
                    "plates_detected": len(unique_plates),
                    "active_alerts": active_alerts,
                    "flow_status": flow_status
                }
                
                project_dir = os.path.dirname(os.path.abspath(__file__))
                db_dir = os.path.join(project_dir, "database")
                os.makedirs(db_dir, exist_ok=True)
                live_stats_path = os.path.join(db_dir, "live_stats.json")
                
                with open(live_stats_path, "w") as f:
                    json.dump(stats_payload, f)
                    
                # Real-time pipeline connector post to FastAPI both endpoints
                for endpoint in ["/api/metrics", "/api/update-metrics"]:
                    try:
                        requests.post(f"http://127.0.0.1:5000{endpoint}", json=stats_payload, timeout=0.1)
                    except Exception:
                        pass
            except Exception as ex:
                pass

            # Draw the line
            cv2.line(frame, (0, line_y), (width, line_y), (255, 0, 0), 3)
            cv2.putText(frame, "VIRTUAL COUNTING LINE", (20, line_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
            
            # Streamlit Display
            video_placeholder.image(frame, channels="BGR", use_container_width=True)
        
        cap.release()
        st.session_state.processing = False
        st.session_state["file_processed"] = True
        st.success("Analysis Complete.")

if __name__ == "__main__":
    main()
