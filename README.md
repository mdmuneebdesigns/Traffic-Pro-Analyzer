# Smart Traffic ANPR System

This project is a real-time Automatic Number Plate Recognition (ANPR) and vehicle counting system.

## Tech Stack
- **Python**: Core logic (OpenCV, YOLOv8, DeepSORT, EasyOCR)
- **FastAPI**: Backend service for persistent data storage (SQLite)
- **Streamlit**: Professional administrative dashboard matching the Stitch Design system.

## Getting Started

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Backend (SQLite + FastAPI)
The FastAPI backend must be running first to handle detection events.
```bash
uvicorn main:app --port 8000
```

### 3. Run Dashboard (Streamlit)
```bash
streamlit run streamlit_app.py
```

### 4. Sample Video
If you don't have a video in the `data/` folder, run:
```bash
# Example command to download a traffic sample
curl -L -o data/sample_traffic.mp4 "https://github.com/intel-iot-devkit/sample-videos/raw/master/traffic-cam-0822.mp4"
```
