import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Camera, 
  MapPin, 
  AlertTriangle, 
  Car, 
  Gauge, 
  Radio, 
  Layers, 
  Maximize2, 
  CheckCircle2, 
  Filter,
  Search
} from 'lucide-react';

// Camera Location Data
export interface CameraLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'active' | 'alert' | 'standby';
  vehiclesNow: number;
  avgSpeed: number;
  lastPlate: string;
  alertReason?: string;
  laneCount: number;
  direction: string;
  resolution: string;
}

export const CAMERA_LOCATIONS: CameraLocation[] = [
  {
    id: 'CAM-01',
    name: 'Central Expressway & 5th Ave',
    lat: 40.7580,
    lng: -73.9855,
    status: 'active',
    vehiclesNow: 8,
    avgSpeed: 58.4,
    lastPlate: 'BC-1234',
    laneCount: 4,
    direction: 'Northbound',
    resolution: '4K UltraHD'
  },
  {
    id: 'CAM-02',
    name: 'North Highway 101 Gate',
    lat: 40.7829,
    lng: -73.9654,
    status: 'alert',
    vehiclesNow: 19,
    avgSpeed: 94.2,
    lastPlate: 'TX-9876',
    alertReason: 'Speed Violation (94 km/h in 60 zone)',
    laneCount: 6,
    direction: 'Southbound',
    resolution: '1080p HD'
  },
  {
    id: 'CAM-03',
    name: 'Downtown Financial Crossing',
    lat: 40.7075,
    lng: -74.0089,
    status: 'active',
    vehiclesNow: 14,
    avgSpeed: 42.1,
    lastPlate: 'NY-4422',
    laneCount: 3,
    direction: 'Eastbound',
    resolution: '4K UltraHD'
  },
  {
    id: 'CAM-04',
    name: 'East River Bridge Toll Plaza',
    lat: 40.7061,
    lng: -73.9969,
    status: 'active',
    vehiclesNow: 26,
    avgSpeed: 64.8,
    lastPlate: 'K-67891',
    laneCount: 8,
    direction: 'Westbound',
    resolution: '4K UltraHD'
  },
  {
    id: 'CAM-05',
    name: 'Airport Loop Sector 4',
    lat: 40.6413,
    lng: -73.7781,
    status: 'standby',
    vehiclesNow: 0,
    avgSpeed: 0.0,
    lastPlate: 'N/A',
    laneCount: 4,
    direction: 'Loop',
    resolution: '1080p HD'
  },
  {
    id: 'CAM-06',
    name: 'Westside Logistics Highway',
    lat: 40.7549,
    lng: -74.0021,
    status: 'active',
    vehiclesNow: 11,
    avgSpeed: 52.0,
    lastPlate: 'A-5591',
    laneCount: 4,
    direction: 'Northbound',
    resolution: '4K UltraHD'
  }
];

// Helper to create custom HTML DivIcon pins for Leaflet
const createCustomIcon = (status: 'active' | 'alert' | 'standby', isSelected: boolean) => {
  let bgClass = 'bg-blue-600 border-white text-white';
  let pulseHtml = '';

  if (status === 'alert') {
    bgClass = 'bg-[#ff4b4b] border-white text-white';
    pulseHtml = `<span class="absolute -inset-1 rounded-full bg-[#ff4b4b]/50 animate-ping"></span>`;
  } else if (status === 'active') {
    bgClass = 'bg-emerald-600 border-white text-white';
    pulseHtml = `<span class="absolute -inset-1 rounded-full bg-emerald-500/30 animate-pulse"></span>`;
  } else {
    bgClass = 'bg-gray-700 border-gray-400 text-gray-300';
  }

  const ringClass = isSelected ? 'ring-4 ring-[#ff4b4b] scale-125 z-50' : 'hover:scale-110';

  return L.divIcon({
    className: 'custom-camera-pin',
    html: `
      <div class="relative flex items-center justify-center w-9 h-9 transition-all duration-200">
        ${pulseHtml}
        <div class="relative w-8 h-8 rounded-full border-2 ${bgClass} shadow-lg flex items-center justify-center font-bold text-xs ${ringClass}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

// Helper to check valid LatLng numbers
const isValidLatLng = (lat: any, lng: any): boolean => {
  return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
};

// Map Recenter Component
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  React.useEffect(() => {
    if (center && Array.isArray(center) && typeof center[0] === 'number' && !isNaN(center[0]) && typeof center[1] === 'number' && !isNaN(center[1])) {
      try {
        map.flyTo(center, zoom, { duration: 1.2 });
      } catch (err) {
        console.warn("MapController flyTo failed:", err);
      }
    }
  }, [center, zoom, map]);
  return null;
};

interface CameraMapProps {
  liveCount?: number;
  liveAvgSpeed?: number;
  livePlatesDetected?: number;
  onSelectCamera?: (cam: CameraLocation) => void;
}

export const CameraMap: React.FC<CameraMapProps> = ({
  liveCount,
  liveAvgSpeed,
  livePlatesDetected,
  onSelectCamera
}) => {
  const [selectedCamId, setSelectedCamId] = useState<string>('CAM-01');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'alert' | 'standby'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');

  // Dynamically update CAM-01 with live stream stats if available
  const updatedLocations = CAMERA_LOCATIONS.map(cam => {
    if (cam.id === 'CAM-01') {
      return {
        ...cam,
        vehiclesNow: typeof liveCount === 'number' && !isNaN(liveCount) ? liveCount : cam.vehiclesNow,
        avgSpeed: typeof liveAvgSpeed === 'number' && !isNaN(liveAvgSpeed) && liveAvgSpeed > 0 ? liveAvgSpeed : cam.avgSpeed,
        status: (typeof liveCount === 'number' && liveCount > 0) ? ('active' as const) : cam.status
      };
    }
    return cam;
  });

  const filteredLocations = updatedLocations.filter(cam => {
    const matchesStatus = filterStatus === 'all' || cam.status === filterStatus;
    const matchesSearch = searchQuery === '' || 
      cam.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      cam.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch && isValidLatLng(cam.lat, cam.lng);
  });

  const selectedCam = updatedLocations.find(c => c.id === selectedCamId) || updatedLocations[0] || CAMERA_LOCATIONS[0];
  const defaultCenter: [number, number] = [40.7580, -73.9855];
  const mapCenter: [number, number] = (selectedCam && isValidLatLng(selectedCam.lat, selectedCam.lng))
    ? [selectedCam.lat, selectedCam.lng]
    : defaultCenter;

  // Tile layer URL
  const tileUrl = mapTheme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  return (
    <div className="glass-card p-5 flex flex-col gap-4 w-full h-full min-h-[460px] border border-black/10 rounded-2xl overflow-hidden shadow-sm">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#141414] text-white flex items-center justify-center shadow-sm shrink-0">
            <Radio size={18} className="text-[#ff4b4b] animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-base tracking-tight text-[#141414] flex items-center gap-2">
              TRAFFIC CAMERA GEOLOCATION MAP
              <span className="text-[10px] font-mono px-2 py-0.5 bg-[#ff4b4b]/10 text-[#ff4b4b] rounded-full uppercase font-bold border border-[#ff4b4b]/20">
                LIVE GIS
              </span>
            </h3>
            <p className="text-xs text-black/50 font-medium">Real-time GPS sensor positioning & intersection feeds</p>
          </div>
        </div>

        {/* Filter and Theme controls */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search */}
          <div className="relative flex-grow sm:w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/40" />
            <input 
              type="text"
              placeholder="Search camera or road..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/90 border border-black/10 rounded-lg focus:outline-none focus:border-[#ff4b4b]"
            />
          </div>

          {/* Filter Status Pills */}
          <div className="flex items-center bg-black/5 p-1 rounded-lg border border-black/5 text-xs font-semibold">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${filterStatus === 'all' ? 'bg-white shadow text-black' : 'text-black/60 hover:text-black'}`}
            >
              All ({updatedLocations.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${filterStatus === 'active' ? 'bg-emerald-600 text-white shadow' : 'text-black/60 hover:text-black'}`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterStatus('alert')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${filterStatus === 'alert' ? 'bg-[#ff4b4b] text-white shadow' : 'text-black/60 hover:text-black'}`}
            >
              Alerts
            </button>
          </div>

          <button
            onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="p-2 bg-white border border-black/10 rounded-lg text-black/70 hover:text-black hover:bg-black/5 transition-colors cursor-pointer"
            title="Toggle Map Style"
          >
            <Layers size={16} />
          </button>
        </div>
      </div>

      {/* Main Grid: Map + Camera Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[380px] sm:h-[420px]">
        {/* Leaflet Map Canvas */}
        <div className="lg:col-span-2 relative h-full rounded-xl overflow-hidden border border-black/10 shadow-inner">
          <MapContainer 
            center={mapCenter} 
            zoom={13} 
            scrollWheelZoom={true}
            className="w-full h-full rounded-xl z-0"
            style={{ minHeight: '100%', width: '100%' }}
          >
            <MapController center={mapCenter} zoom={13} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url={tileUrl}
            />

            {/* Density Circles around high traffic cameras */}
            {filteredLocations.map((cam) => {
              if (cam.vehiclesNow > 10) {
                return (
                  <Circle
                    key={`circle-${cam.id}`}
                    center={[cam.lat, cam.lng]}
                    radius={350 + cam.vehiclesNow * 15}
                    pathOptions={{
                      color: cam.status === 'alert' ? '#ff4b4b' : '#10b981',
                      fillColor: cam.status === 'alert' ? '#ff4b4b' : '#10b981',
                      fillOpacity: 0.15,
                      weight: 1.5,
                      dashArray: '4, 4'
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Markers */}
            {filteredLocations.map((cam) => {
              const isSelected = cam.id === selectedCamId;
              return (
                <Marker
                  key={cam.id}
                  position={[cam.lat, cam.lng]}
                  icon={createCustomIcon(cam.status, isSelected)}
                  eventHandlers={{
                    click: () => {
                      setSelectedCamId(cam.id);
                      if (onSelectCamera) onSelectCamera(cam);
                    }
                  }}
                >
                  <Popup className="custom-leaflet-popup" offset={[0, -10]}>
                    <div className="p-2 text-white min-w-[200px]">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
                        <span className="font-extrabold text-xs tracking-wider text-[#ff4b4b] uppercase">{cam.id}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          cam.status === 'alert' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          cam.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {cam.status}
                        </span>
                      </div>
                      <p className="font-bold text-xs mb-2 leading-tight">{cam.name}</p>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-white/5 p-2 rounded-lg mb-2">
                        <div>
                          <p className="text-white/50 uppercase">Vehicles</p>
                          <p className="font-mono font-bold text-sm text-emerald-400">{cam.vehiclesNow}</p>
                        </div>
                        <div>
                          <p className="text-white/50 uppercase">Avg Speed</p>
                          <p className="font-mono font-bold text-sm text-amber-300">{cam.avgSpeed} km/h</p>
                        </div>
                      </div>

                      {cam.alertReason && (
                        <div className="p-1.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] text-red-300 mb-2 flex items-center gap-1 font-medium">
                          <AlertTriangle size={12} className="shrink-0 text-red-400" />
                          <span>{cam.alertReason}</span>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          setSelectedCamId(cam.id);
                          if (onSelectCamera) onSelectCamera(cam);
                        }}
                        className="w-full mt-1 py-1 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white font-bold text-[10px] rounded tracking-wide transition-colors cursor-pointer"
                      >
                        SELECT LIVE FEED
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Quick Floating Legend overlay */}
          <div className="absolute bottom-3 left-3 z-[400] bg-[#141414]/90 backdrop-blur-md text-white px-3 py-2 rounded-xl text-[10px] font-medium border border-white/10 shadow-lg flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Active (Normal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff4b4b] animate-ping" /> Violation / Alert
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Standby
            </span>
          </div>
        </div>

        {/* Selected Camera Details Sidebar */}
        <div className="flex flex-col gap-3 bg-white/70 backdrop-blur-sm p-4 rounded-xl border border-black/10 overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-black/10">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-[#ff4b4b]" />
              <span className="font-extrabold text-xs uppercase tracking-wider text-black/80">Camera Details</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-black/5 px-2 py-0.5 rounded text-black/60">
              {selectedCam.id}
            </span>
          </div>

          <div>
            <h4 className="font-bold text-sm text-[#141414] leading-snug">{selectedCam.name}</h4>
            <p className="text-[11px] text-black/50 mt-0.5 font-medium flex items-center gap-1">
              <MapPin size={12} className="text-[#ff4b4b]" />
              Lat: {isValidLatLng(selectedCam?.lat, selectedCam?.lng) ? selectedCam.lat.toFixed(4) : '40.7580'}, Lng: {isValidLatLng(selectedCam?.lat, selectedCam?.lng) ? selectedCam.lng.toFixed(4) : '-73.9855'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 my-1">
            <div className="p-2.5 bg-white border border-black/10 rounded-xl shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-black/40 flex items-center gap-1">
                <Car size={12} className="text-blue-500" /> Live Vehicles
              </p>
              <p className="text-lg font-mono font-extrabold text-[#141414] mt-0.5">{selectedCam.vehiclesNow}</p>
            </div>
            <div className="p-2.5 bg-white border border-black/10 rounded-xl shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-black/40 flex items-center gap-1">
                <Gauge size={12} className="text-amber-500" /> Avg Speed
              </p>
              <p className="text-lg font-mono font-extrabold text-[#141414] mt-0.5">{selectedCam.avgSpeed.toFixed(1)} <span className="text-xs font-normal text-black/50">km/h</span></p>
            </div>
          </div>

          {/* System Telemetry & Metadata */}
          <div className="space-y-2 text-xs bg-black/5 p-3 rounded-xl border border-black/5">
            <div className="flex justify-between items-center">
              <span className="text-black/50 font-medium">Stream Resolution:</span>
              <span className="font-bold text-black/80">{selectedCam.resolution}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-black/50 font-medium">Monitored Lanes:</span>
              <span className="font-bold text-black/80">{selectedCam.laneCount} Lanes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-black/50 font-medium">Traffic Orientation:</span>
              <span className="font-bold text-black/80">{selectedCam.direction}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-black/50 font-medium">Latest OCR Plate:</span>
              <span className="font-mono font-bold bg-[#141414] text-white px-2 py-0.5 rounded text-[11px]">
                {selectedCam.lastPlate}
              </span>
            </div>
          </div>

          {/* Quick Camera Switcher list */}
          <div className="mt-auto pt-2 border-t border-black/10">
            <p className="text-[10px] font-bold uppercase text-black/40 mb-2">Switch Camera Node ({updatedLocations.length})</p>
            <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
              {updatedLocations.map(cam => (
                <button
                  key={cam.id}
                  onClick={() => {
                    setSelectedCamId(cam.id);
                    if (onSelectCamera) onSelectCamera(cam);
                  }}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs text-left transition-colors cursor-pointer border ${
                    cam.id === selectedCamId 
                      ? 'bg-[#141414] text-white border-[#141414]' 
                      : 'bg-white hover:bg-black/5 text-black border-black/10'
                  }`}
                >
                  <div className="truncate pr-2">
                    <p className="font-bold text-[11px] truncate">{cam.name}</p>
                    <p className={`text-[9px] ${cam.id === selectedCamId ? 'text-white/60' : 'text-black/40'}`}>
                      {cam.id} • {cam.vehiclesNow} vehicles
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    cam.status === 'alert' ? 'bg-[#ff4b4b]' :
                    cam.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'
                  }`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
