import streamlit as st

st.set_page_config(page_title="System Health | TrafficFlow AI", layout="wide")

st.markdown("""
    <style>
    .stitch-card {
        background: white;
        padding: 24px;
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        margin-bottom: 20px;
        border: 1px solid #f0f0f0;
    }
    .status-badge {
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }
    .status-online { background-color: #dcfce7; color: #166534; }
    .status-warning { background-color: #fef9c3; color: #854d0e; }
    .status-offline { background-color: #fee2e2; color: #991b1b; }
    
    .grid-view {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
    }
    </style>
""", unsafe_allow_html=True)

st.title("System Health & Infrastructure")

# AI Processing Cluster
st.subheader("AI Processing Cluster")
col1, col2, col3 = st.columns(3)

with col1:
    st.markdown("""
        <div class="stitch-card">
            <h4>Alpha Node 01</h4>
            <p><span class="status-badge status-online">Online</span></p>
            <p>GPU Utilization: 42%</p>
            <p>Memory: 4.2GB / 12GB</p>
        </div>
    """, unsafe_allow_html=True)

with col2:
    st.markdown("""
        <div class="stitch-card">
            <h4>Beta Node 02</h4>
            <p><span class="status-badge status-online">Online</span></p>
            <p>GPU Utilization: 15%</p>
            <p>Memory: 1.8GB / 12GB</p>
        </div>
    """, unsafe_allow_html=True)

with col3:
    st.markdown("""
        <div class="stitch-card">
            <h4>Inference Engine (YOLOv8)</h4>
            <p><span class="status-badge status-warning">Optimization Required</span></p>
            <p>Latency: 45ms</p>
            <p>Model: yolov8n.pt</p>
        </div>
    """, unsafe_allow_html=True)

# Network Topology
st.subheader("Optical Feed Topology")
st.image("https://picsum.photos/seed/network/800/400", caption="Active Camera Node Network")

# System Logs
st.subheader("Diagnostics Terminal")
logs = [
    "[INFO] 14:48:02 - New vehicle detected (Type: Truck, ID: #482)",
    "[INFO] 14:48:05 - API Response: 200 OK (Endpoint: /stats)",
    "[WARN] 14:48:10 - Frame dropped on Camera #02 (Congestion detected)",
    "[INFO] 14:48:12 - Plate recognized: ABC-123",
    "[INFO] 14:48:15 - Syncing local SQLite to Cloud Backup..."
]
st.code("\n".join(logs), language="bash")
