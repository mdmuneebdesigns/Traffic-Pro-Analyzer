import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  BarChart3, 
  Car, 
  Database, 
  Eye, 
  FileText, 
  History, 
  LayoutDashboard, 
  Settings, 
  ShieldCheck, 
  Truck, 
  AlertTriangle,
  Play,
  Pause,
  Upload,
  RefreshCw,
  Menu,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// Mock Data
const MOCK_STATS = [
  { time: '08:00', vehicles: 45 },
  { time: '09:00', vehicles: 82 },
  { time: '10:00', vehicles: 120 },
  { time: '11:00', vehicles: 95 },
  { time: '12:00', vehicles: 110 },
  { time: '13:00', vehicles: 135 },
  { time: '14:00', vehicles: 105 },
];

const MOCK_LOGS = [
  { id: 1, type: 'Car', plate: 'BC-1234', time: '14:23:45', confidence: '0.98' },
  { id: 2, type: 'Truck', plate: 'TX-9876', time: '14:21:12', confidence: '0.94' },
  { id: 3, type: 'Car', plate: 'K-67891', time: '14:18:33', confidence: '0.99' },
  { id: 4, type: 'Van', plate: 'NY-4422', time: '14:15:01', confidence: '0.88' },
];

const DEFAULT_SETTINGS = {
  confidenceThreshold: 0.45,
  deepSortMaxAge: 30,
  autoSaveCaptures: true,
};

const App = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('traffic_logs');
    return saved ? JSON.parse(saved) : MOCK_LOGS;
  });
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('traffic_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; sub: string; type: string }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [detectedBoxes, setDetectedBoxes] = useState<any[]>([]);

  const [liveStats, setLiveStats] = useState({
    live_count: 0,
    avg_speed: 48.0,
    plates_detected: 0,
    active_alerts: 0,
    flow_status: "No Traffic"
  });

  useEffect(() => {
    let active = true;
    const fetchLiveStats = async () => {
      try {
        const res = await fetch("/api/traffic-metrics");
        if (res.ok && active) {
          const data = await res.json();
          setLiveStats({
            live_count: typeof data.live_count === "number" ? data.live_count : 0,
            avg_speed: typeof data.avg_speed === "number" ? data.avg_speed : 48.0,
            plates_detected: typeof data.plates_detected === "number" ? data.plates_detected : 0,
            active_alerts: typeof data.active_alerts === "number" ? data.active_alerts : 0,
            flow_status: typeof data.flow_status === "string" ? data.flow_status : "No Traffic"
          });
        }
      } catch (err) {
        // Handle transient connection/offline errors gracefully during server reboots
        if (active) {
          console.debug("Live stats server connection is initializing...");
        }
      }
    };

    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('traffic_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('traffic_settings', JSON.stringify(settings));
  }, [settings]);

  const addToast = (message: string, sub: string, type: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, sub, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleNewFeed = () => {
    fileInputRef.current?.click();
  };

  const handleRecalibrate = () => {
    setIsRecalibrating(true);
    setTimeout(() => {
      setIsRecalibrating(false);
      addToast("Sensor Calibration Complete", "All camera parameters successfully recalibrated to 100% accuracy", "System");
    }, 1500);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        setUploadedImage(base64Url);
        setIsAnalyzing(true);
        setDetectedBoxes([]);
        addToast("Processing Feed", `Source: ${file.name}. Initializing computer vision engine...`, "System");

        try {
          // Strip data-url prefix
          const base64Data = base64Url.split(",")[1];
          const response = await fetch("/api/analyze-feed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: base64Data,
              mimeType: file.type,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
          }

          const data = await response.json();
          if (data.detections && Array.isArray(data.detections)) {
            // Map detected vehicles into logs
            const newLogs = data.detections.map((d: any, index: number) => ({
              id: Date.now() + index,
              type: d.type || "Car",
              plate: d.plate || "N/A",
              time: new Date().toLocaleTimeString(),
              confidence: d.confidence > 1 ? (d.confidence / 100).toFixed(2) : d.confidence.toFixed(2),
              color: d.color,
              brand: d.brand,
              box: d.box,
            }));

            setLogs(newLogs);
            setDetectedBoxes(data.detections);
            
            if (data.fallbackUsed && (!data.detections || data.detections.length === 0)) {
              addToast(
                "Demo Mode Active",
                "YOLO11 engine is initializing in the background. Please try again in a few seconds.",
                "System"
              );
            } else if (data.detections.length === 0) {
              addToast(
                "Analysis Complete",
                "No vehicles detected in this image. Make sure to upload a scene containing vehicles.",
                "System"
              );
            } else {
              addToast(
                "Analysis Complete",
                `Found ${data.detections.length} vehicles! Detected: ${data.detections.map((v: any) => v.plate || v.type).filter(Boolean).join(", ")}`,
                "System"
              );
            }
          } else {
            throw new Error("Invalid response format from API");
          }
        } catch (err: any) {
          console.error("Analysis request failed:", err);
          setDetectedBoxes([]);
          addToast(
            "Analysis Unavailable",
            "The AI/YOLO computer vision engine is still launching. Please wait a moment and try again.",
            "System"
          );
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Simulate incoming logs
  useEffect(() => {
    if (!isPlaying || uploadedImage) return;
    const interval = setInterval(() => {
      const confidenceVal = Math.random() * 0.2 + 0.8;
      const vehicleType = Math.random() > 0.3 ? 'Car' : 'Truck';
      const plate = `${['A','K','TX','NY'][Math.floor(Math.random()*4)]}-${Math.floor(Math.random()*9000)+1000}`;
      
      const newLog = {
        id: Date.now(),
        type: vehicleType,
        plate: plate,
        time: new Date().toLocaleTimeString(),
        confidence: confidenceVal.toFixed(2),
      };

      setLogs(prev => [newLog, ...prev.slice(0, 5)]);

      if (confidenceVal >= 0.95) {
        addToast(
          "High Confidence Detection!",
          `${vehicleType.toUpperCase()} (${plate}) detected with ${(confidenceVal * 100).toFixed(0)}% confidence`,
          vehicleType
        );
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, uploadedImage]);

  const renderContent = () => {
    switch (activeTab) {
      case 'analytics':
        return <AnalyticsView stats={MOCK_STATS} />;
      case 'history':
        return <HistoryView logs={logs} settings={settings} onAddToast={addToast} />;
      case 'health':
        return <HealthView />;
      case 'config':
        return (
          <ConfigView 
            settings={settings} 
            onSave={(newSettings: any) => {
              setSettings(newSettings);
              addToast("Settings Saved", "Inference settings successfully saved and applied!", "System");
            }} 
            onReset={() => {
              setSettings(DEFAULT_SETTINGS);
              addToast("Settings Reset", "Inference settings restored to default values!", "System");
            }}
          />
        );
      case 'dashboard':
      default:
        return (
          <div className="flex flex-col gap-8">
            {/* KPI Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard icon={<Eye className="text-blue-500" />} label="Live Count" value={liveStats.live_count.toLocaleString()} subValue={liveStats.live_count === 0 ? "Empty Road" : "Active Flow"} />
              <StatCard icon={<Car className="text-green-500" />} label="Avg Speed" value={`${liveStats.avg_speed} km/h`} subValue={liveStats.live_count === 0 ? "No Active Vehicles" : `Flow: ${liveStats.flow_status || "Stable"}`} />
              <StatCard icon={<Database className="text-purple-500" />} label="Plates Detected" value={liveStats.plates_detected.toString()} subValue={liveStats.plates_detected > 0 ? "Unique Plates Logged" : "OCR Standby"} />
              <StatCard icon={<AlertTriangle className="text-orange-500" />} label="Active Alerts" value={liveStats.active_alerts.toString()} subValue={liveStats.active_alerts > 0 ? "Overspeeding Detected" : "No Active Alerts"} />
            </section>

            {/* Video & Controls Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group">
                  <img 
                    src={uploadedImage || "https://picsum.photos/seed/traffic/1200/800"} 
                    className={`w-full h-full object-cover transition-all duration-300 ${uploadedImage ? 'opacity-100' : 'opacity-70 grayscale-[0.3]'}`} 
                    alt="Traffic Feed"
                  />
                  
                  {/* Bounding Box Overlays */}
                  {uploadedImage ? (
                    // Draw actual, real AI detected bounding boxes from Gemini!
                    !isAnalyzing && detectedBoxes.map((boxItem, idx) => {
                      const { box, type, plate, confidence, color, brand } = boxItem;
                      if (!box) return null;
                      const top = `${box.ymin}%`;
                      const left = `${box.xmin}%`;
                      const height = `${box.ymax - box.ymin}%`;
                      const width = `${box.xmax - box.xmin}%`;

                      return (
                        <div 
                          key={idx} 
                          className="absolute border-2 border-red-500 rounded flex flex-col items-start"
                          style={{
                            top,
                            left,
                            height,
                            width,
                            boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)"
                          }}
                        >
                          <span className="bg-red-500 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 font-bold whitespace-nowrap leading-tight rounded-br shadow-md">
                            {type.toUpperCase()} {plate ? `[${plate}]` : ''} ({confidence}%)
                          </span>
                          {brand && (
                            <span className="bg-black/80 text-white text-[8px] sm:text-[9px] px-1.5 py-0.5 font-medium whitespace-nowrap mt-0.5 rounded shadow-sm">
                              {brand} ({color})
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    // YOLO Bounding Box Overlays (Decorative fallback)
                    <>
                      <div className="absolute top-[30%] left-[40%] w-32 h-24 border-2 border-green-500/80 rounded flex flex-col items-start p-1">
                        <span className="bg-green-500 text-white text-[10px] px-1 font-bold">CAR 0.98</span>
                      </div>
                      <div className="absolute top-[60%] left-[10%] w-48 h-32 border-2 border-yellow-500/80 rounded flex flex-col items-start p-1">
                        <span className="bg-yellow-500 text-white text-[10px] px-1 font-bold">TRUCK 0.94</span>
                      </div>
                    </>
                  )}
                  
                  {/* Tracking Line */}
                  <div className="absolute top-[75%] left-0 w-full h-[2px] bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                    <div className="absolute -top-2 left-4 px-2 bg-red-500 text-white text-[10px] font-bold rounded">VIRTUAL DETECTION LINE</div>
                  </div>

                  {/* Loading / Analyzing Overlay */}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-10">
                      <div className="relative flex items-center justify-center mb-4">
                        <div className="w-12 h-12 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
                        <Activity className="absolute text-red-500 animate-pulse" size={20} />
                      </div>
                      <h4 className="text-white font-bold text-base sm:text-lg tracking-wider uppercase mb-1">
                        Analyzing Image Feed
                      </h4>
                      <p className="text-white/60 text-xs sm:text-sm max-w-md">
                        AI model is executing multimodal computer vision analysis to detect vehicle types, colors, models, and read license plates...
                      </p>
                    </div>
                  )}

                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/20 p-2 px-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button className="text-white hover:text-[#ff4b4b]" onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>
                    <div className="h-4 w-[1px] bg-white/20" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white font-mono uppercase tracking-widest">
                        {uploadedImage ? "STATIC FEED ANALYSIS" : "LIVE RELAY // 1080P // 30FPS"}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="glass-card p-6 flex items-center justify-between">
                  <div className="flex gap-8">
                    <div className="flex flex-col">
                      <span className="text-xs text-black/40 font-bold uppercase tracking-wider">Confidence Threshold</span>
                      <span className="text-lg font-mono">{settings.confidenceThreshold}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-black/40 font-bold uppercase tracking-wider">Detection Rate</span>
                      <span className="text-lg font-mono">842ms</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleRecalibrate}
                    disabled={isRecalibrating}
                    className="flex items-center gap-2 text-[#ff4b4b] font-bold text-sm tracking-tight hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isRecalibrating ? "animate-spin" : ""} />
                    {isRecalibrating ? "RECALIBRATING..." : "RECALIBRATE SENSORS"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="glass-card p-6 flex-grow flex flex-col">
                  <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-black/40 mb-6 flex items-center gap-2">
                    <Activity size={16} />
                    Vehicle Flow History
                  </h3>
                  <div className="flex-grow" style={{ width: '100%', height: 300, minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={MOCK_STATS}>
                        <defs>
                          <linearGradient id="colorVeh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff4b4b" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#ff4b4b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141408" />
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Area type="monotone" dataKey="vehicles" stroke="#ff4b4b" strokeWidth={2} fillOpacity={1} fill="url(#colorVeh)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-6 h-full overflow-hidden flex flex-col">
                  <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-black/40 mb-6 flex items-center justify-between">
                    <span className="flex items-center gap-2"><FileText size={16} /> Live Data Stream</span>
                    <span className="text-green-500 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> SYNC</span>
                  </h3>
                  <div className="flex flex-col gap-3 overflow-y-auto pr-2">
                    <AnimatePresence mode="popLayout">
                      {logs.map((log) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          key={log.id} 
                          className="flex items-center justify-between p-3 rounded-lg border border-black/5 hover:bg-black/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded flex items-center justify-center ${log.type === 'Car' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                              {log.type === 'Car' ? <Car size={16} /> : <Truck size={16} />}
                            </div>
                            <div>
                              <p className="text-xs font-bold leading-none mb-1 uppercase tracking-tight">{log.plate}</p>
                              <p className="text-[10px] text-black/40 font-medium">DETECTED @ {log.time}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-black/5 rounded">{log.confidence}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile Drawer Overlay and Sidebar with Framer Motion */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden cursor-pointer"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", ease: "easeInOut", duration: 0.25 }}
              className="fixed inset-y-0 left-0 w-64 bg-[#141414] text-white flex flex-col p-6 gap-8 z-50 lg:hidden shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#ff4b4b] rounded-lg flex items-center justify-center">
                    <Activity className="text-white" size={24} />
                  </div>
                  <span className="font-bold text-xl tracking-tight">TRAFFICFLOW AI</span>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)} 
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="flex flex-col gap-2 flex-grow">
                <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={<BarChart3 size={18} />} label="Analytics" active={activeTab === 'analytics'} onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={<History size={18} />} label="Logs History" active={activeTab === 'history'} onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={<ShieldCheck size={18} />} label="System Health" active={activeTab === 'health'} onClick={() => { setActiveTab('health'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={<Settings size={18} />} label="Config" active={activeTab === 'config'} onClick={() => { setActiveTab('config'); setIsMobileMenuOpen(false); }} />
              </nav>

              <div className="bg-white/10 p-4 rounded-xl">
                <p className="text-xs opacity-50 uppercase font-bold mb-2">Node Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium">System Online</span>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Persistent) */}
      <aside className="hidden lg:flex w-64 bg-[#141414] text-white flex-col p-6 gap-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#ff4b4b] rounded-lg flex items-center justify-center">
            <Activity className="text-white" size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight">TRAFFICFLOW AI</span>
        </div>

        <nav className="flex flex-col gap-2 flex-grow">
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<BarChart3 size={18} />} label="Analytics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
          <NavItem icon={<History size={18} />} label="Logs History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <NavItem icon={<ShieldCheck size={18} />} label="System Health" active={activeTab === 'health'} onClick={() => setActiveTab('health')} />
          <NavItem icon={<Settings size={18} />} label="Config" active={activeTab === 'config'} onClick={() => setActiveTab('config')} />
        </nav>

        <div className="bg-white/10 p-4 rounded-xl">
          <p className="text-xs opacity-50 uppercase font-bold mb-2">Node Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">System Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#F0EFEC] overflow-y-auto">
        {/* Header */}
        <header className="h-20 border-b border-black/5 bg-white flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-black/50">
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="lg:hidden p-2 -ml-2 mr-1 text-black/70 hover:text-black hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <LayoutDashboard size={14} className="shrink-0" />
            <span className="truncate">/ {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} / Live Monitor</span>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileChange} 
              className="hidden" 
              accept="video/*,image/*"
            />
            {uploadedImage && (
              <button 
                onClick={() => {
                  setUploadedImage(null);
                  setDetectedBoxes([]);
                  setLogs(MOCK_LOGS);
                  addToast("Reset to Live Stream", "System restored to default simulated traffic stream", "System");
                }}
                className="flex items-center gap-2 px-3 py-2 border border-black/10 bg-white hover:bg-black/5 text-black rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <RefreshCw size={16} />
                Reset Feed
              </button>
            )}
            <button 
              onClick={handleNewFeed}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Upload size={16} />
              New Feed
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 flex flex-col gap-8 max-w-[1600px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
              className="pointer-events-auto bg-[#141414] text-white p-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.3)] border border-white/10 flex items-start gap-3 min-w-[320px]"
            >
              <div className="mt-0.5 shrink-0">
                {toast.type === 'Car' ? (
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <Car size={16} />
                  </div>
                ) : toast.type === 'Truck' ? (
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center">
                    <Truck size={16} />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-[#ff4b4b]/10 text-[#ff4b4b] flex items-center justify-center animate-pulse">
                    <Activity size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <span>{toast.message}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff4b4b] animate-ping" />
                </h4>
                <p className="text-[11px] text-white/60 mt-1 font-medium">{toast.sub}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-white/40 hover:text-white text-xs font-bold leading-none self-start p-1 cursor-pointer transition-colors"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active = false, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${
      active ? 'bg-[#ff4b4b] text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
    }`}
  >
    <div className={`${active ? 'text-white' : 'text-white/30 group-hover:text-white'}`}>{icon}</div>
    <span className="font-bold tracking-tight text-sm uppercase">{label}</span>
  </button>
);

const StatCard = ({ icon, label, value, subValue }: any) => (
  <div className="glass-card p-6 group hover:translate-y-[-4px] transition-transform duration-300">
    <div className="flex items-start justify-between mb-4">
      <div className="w-10 h-10 rounded-xl bg-black/[0.03] flex items-center justify-center">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-black/30 bg-black/[0.03] px-2 py-1 rounded-full uppercase tracking-widest leading-none">REAL-TIME</span>
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">{label}</p>
    <div className="flex items-baseline gap-2">
      <h4 className="text-2xl font-bold tracking-tighter">{value}</h4>
      <span className="text-[10px] font-semibold text-black/60">{subValue}</span>
    </div>
  </div>
);

// --- Sub-View Components ---

const AnalyticsView = ({ stats }: any) => (
  <div className="flex flex-col gap-8">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="glass-card p-8">
        <h3 className="text-lg font-bold mb-6">Peak Traffic Hours</h3>
        <div style={{ width: '100%', height: 300, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141408" />
              <XAxis dataKey="time" />
              <YAxis hide />
              <Tooltip />
              <Bar dataKey="vehicles" fill="#ff4b4b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="glass-card p-8">
        <h3 className="text-lg font-bold mb-6">Traffic Intensity (Real-time)</h3>
        <div style={{ width: '100%', height: 300, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats}>
              <XAxis dataKey="time" />
              <YAxis hide />
              <Tooltip />
              <Area type="monotone" dataKey="vehicles" stroke="#ff4b4b" fill="#ff4b4b20" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </div>
);

const HistoryView = ({ logs, settings, onAddToast }: any) => {
  const exportCSV = () => {
    const headers = "ID,Vehicle,License Plate,Time,Confidence,Status\n";
    const rows = logs.map((log: any) => `${log.id},${log.type},${log.plate},${log.time},${log.confidence},${settings?.autoSaveCaptures ? 'Stored' : 'Cached'}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `traffic_logs_${Date.now()}.csv`);
    a.click();
    if (onAddToast) {
      onAddToast("Export Successful", "Traffic logs exported successfully as CSV!", "System");
    } else {
      alert("Logs exported successfully as CSV!");
    }
  };

  const isAutoSave = settings?.autoSaveCaptures !== false;

  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="p-6 border-b border-black/5 flex items-center justify-between bg-black/[0.01]">
        <h3 className="font-bold flex items-center gap-2"><History size={18} /> Detection Catalog</h3>
        <button 
          onClick={exportCSV}
          className="text-xs font-bold uppercase tracking-widest text-[#ff4b4b] hover:text-[#ff4b4b]/80 cursor-pointer"
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-black text-white text-[10px] uppercase font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Vehicle</th>
              <th className="px-6 py-4">License Plate</th>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4">Confidence</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-black/[0.02] transition-colors">
                <td className="px-6 py-4 text-xs font-mono">{log.id.toString().slice(-6)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {log.type === 'Car' ? <Car size={14} className="text-blue-500" /> : <Truck size={14} className="text-orange-500" />}
                    <span className="text-sm font-medium">{log.type}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-black text-white rounded text-[10px] font-bold font-mono">{log.plate}</span>
                </td>
                <td className="px-6 py-4 text-xs text-black/60">{log.time}</td>
                <td className="px-6 py-4 text-xs font-mono font-bold text-green-600">{log.confidence}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    isAutoSave ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isAutoSave ? 'Stored' : 'Cached Only'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const HealthView = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-black/40 uppercase">CPU Usage</span>
        <span className="text-green-500 font-bold">Stable</span>
      </div>
      <div className="h-2 w-full bg-black/5 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 w-[24%]" />
      </div>
      <p className="text-[10px] text-black/40">Load Average: 0.12, 0.44, 0.82</p>
    </div>
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-black/40 uppercase">GPU Temp</span>
        <span className="text-orange-500 font-bold">42°C</span>
      </div>
      <div className="h-2 w-full bg-black/5 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500 w-[68%]" />
      </div>
      <p className="text-[10px] text-black/40">Jetson Xavier Node // Active</p>
    </div>
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-black/40 uppercase">API Latency</span>
        <span className="text-blue-500 font-bold">Low</span>
      </div>
      <div className="h-2 w-full bg-black/5 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 w-[12%]" />
      </div>
      <p className="text-[10px] text-black/40">Avg Response: 142ms</p>
    </div>
  </div>
);

const ConfigView = ({ settings, onSave, onReset }: any) => {
  const [localThreshold, setLocalThreshold] = useState(settings.confidenceThreshold);
  const [localMaxAge, setLocalMaxAge] = useState(settings.deepSortMaxAge);
  const [localAutoSave, setLocalAutoSave] = useState(settings.autoSaveCaptures);

  useEffect(() => {
    setLocalThreshold(settings.confidenceThreshold);
    setLocalMaxAge(settings.deepSortMaxAge);
    setLocalAutoSave(settings.autoSaveCaptures);
  }, [settings]);

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <div className="glass-card p-8">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Settings size={20} /> Inference Settings</h3>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-black/40">Detection Confidence Threshold</label>
              <span className="text-xs font-mono font-bold bg-[#ff4b4b]/10 text-[#ff4b4b] px-2 py-0.5 rounded">{localThreshold}</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.05"
              value={localThreshold}
              onChange={(e) => setLocalThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-black/10 rounded-lg appearance-none cursor-pointer accent-[#ff4b4b]" 
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase text-black/40">DeepSORT Max Age (Frames)</label>
            <input 
              type="number" 
              value={localMaxAge} 
              onChange={(e) => setLocalMaxAge(parseInt(e.target.value) || 0)}
              className="p-3 bg-black/5 border-none rounded-xl text-sm outline-none focus:ring-1 ring-[#ff4b4b] w-full" 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-bold">Auto-Save Captures</span>
              <span className="text-xs text-black/40">Save vehicle crops to storage</span>
            </div>
            <button 
              onClick={() => setLocalAutoSave(!localAutoSave)}
              className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${localAutoSave ? 'bg-[#ff4b4b]' : 'bg-black/20'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${localAutoSave ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex gap-4">
        <button 
          onClick={() => onSave({ confidenceThreshold: localThreshold, deepSortMaxAge: localMaxAge, autoSaveCaptures: localAutoSave })}
          className="flex-1 py-4 bg-black text-white font-bold rounded-2xl hover:bg-black/80 transition-all cursor-pointer"
        >
          Save Changes
        </button>
        <button 
          onClick={onReset}
          className="px-8 py-4 border border-black/10 font-bold rounded-2xl hover:bg-black/5 transition-all cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default App;
