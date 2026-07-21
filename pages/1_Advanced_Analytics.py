import streamlit as st
import pandas as pd
import plotly.express as px
from database import db

# Design Setup
st.set_page_config(page_title="Advanced Analytics | TrafficFlow AI", layout="wide")

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    .stitch-card {
        background: white;
        padding: 24px;
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        margin-bottom: 20px;
        border: 1px solid #f0f0f0;
    }
    
    .stat-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: #1e293b;
    }
    </style>
""", unsafe_allow_html=True)

st.title("Advanced Analytics & Reporting")

# Load Data
stats = db.get_stats()
total_volume = sum(stats.values())

# KPI Row
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown(f'<div class="stitch-card"><div class="stat-label">Total Volume</div><div class="stat-value">{total_volume}</div></div>', unsafe_allow_html=True)
with col2:
    st.markdown(f'<div class="stitch-card"><div class="stat-label">Avg Congestion</div><div class="stat-value">34%</div></div>', unsafe_allow_html=True)
with col3:
    st.markdown(f'<div class="stitch-card"><div class="stat-label">Peak Flow Rate</div><div class="stat-value">4,820</div></div>', unsafe_allow_html=True)
with col4:
    st.markdown(f'<div class="stitch-card"><div class="stat-label">System Uptime</div><div class="stat-value">99.8%</div></div>', unsafe_allow_html=True)

# Charts
c_left, c_right = st.columns(2)

with c_left:
    st.subheader("Historical Flow Trends")
    # Mock trend data
    df_trend = pd.DataFrame({
        'Hour': list(range(24)),
        'Flow': [100, 80, 50, 40, 60, 150, 400, 800, 1200, 900, 700, 650, 700, 750, 800, 850, 1200, 1500, 1400, 1000, 600, 400, 200, 150]
    })
    fig = px.line(df_trend, x='Hour', y='Flow', template='plotly_white', color_discrete_sequence=['#3b82f6'])
    st.plotly_chart(fig, use_container_width=True)

with c_right:
    st.subheader("Vehicle Class Distribution")
    if stats:
        df_stats = pd.DataFrame(list(stats.items()), columns=['Type', 'Count'])
        fig_pie = px.pie(df_stats, values='Count', names='Type', hole=0.4, template='plotly_white')
        st.plotly_chart(fig_pie, use_container_width=True)
    else:
        st.info("No data available yet. Start the monitoring system to see analytics.")

# Heatmap Mock
st.subheader("Peak-Hour Heatmap")
import numpy as np
heatmap_data = np.random.randint(0, 100, size=(7, 24))
df_heat = pd.DataFrame(heatmap_data, columns=[f"{i}:00" for i in range(24)], index=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
st.write("This map visualizes congestion levels across different days and times.")
st.dataframe(df_heat, use_container_width=True)
