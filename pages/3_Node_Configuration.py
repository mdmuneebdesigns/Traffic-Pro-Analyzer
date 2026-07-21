import streamlit as st

st.set_page_config(page_title="Node Configuration | TrafficFlow AI", layout="wide")

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
    </style>
""", unsafe_allow_html=True)

st.title("User Settings & Node Configuration")

col_left, col_right = st.columns([1, 1])

with col_left:
    st.markdown('<div class="stitch-card">', unsafe_allow_html=True)
    st.subheader("Global Alert Thresholds")
    st.slider("Max Speed Threshold (km/h)", 20, 150, 40)
    st.slider("Min Confidence (YOLO)", 0.0, 1.0, 0.45)
    st.checkbox("Enable Automatic Plate Retention", value=True)
    st.button("Save Changes")
    st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="stitch-card">', unsafe_allow_html=True)
    st.subheader("Active Camera Feeds")
    st.text_input("Source URL #1", "rtsp://camera01.city.net:554/live")
    st.text_input("Source URL #2 (Backup)", "rtsp://camera02.city.net:554/live")
    st.markdown('</div>', unsafe_allow_html=True)

with col_right:
    st.markdown('<div class="stitch-card">', unsafe_allow_html=True)
    st.subheader("Node Access")
    st.selectbox("Administrative Role", ["Super-Admin Group", "Traffic Control Div 4", "City Emergency Services"])
    st.button("Regenerate Token")
    st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="stitch-card">', unsafe_allow_html=True)
    st.subheader("External Integrations")
    st.checkbox("City Emergency Services (API)", value=True)
    st.checkbox("DOT Data Warehouse (SFTP)", value=False)
    st.checkbox("Public Transit Real-time Feed", value=True)
    st.markdown('</div>', unsafe_allow_html=True)
