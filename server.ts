import express from "express";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function startBackendAPI() {
  console.log("Checking Python environment for flask...");
  const check = spawn("python3", ["-c", "import flask"], { stdio: "ignore" });
  
  check.on("error", (err) => {
    console.error("Error checking Python environment:", err.message);
  });
  
  check.on("close", async (code) => {
    if (code !== 0) {
      console.log("flask not found. Finding an available pip installer...");
      
      const runCommand = (cmd: string, args: string[]) => {
        return new Promise<{ code: number; output: string }>((resolve) => {
          const child = spawn(cmd, args);
          let logData = "";
          child.stdout?.on("data", (data) => { logData += data.toString(); });
          child.stderr?.on("data", (data) => { logData += data.toString(); });
          
          child.on("error", (err) => {
            logData += `\nError spawning ${cmd}: ${err.message}\n`;
            resolve({ code: -1, output: logData });
          });

          child.on("close", (childCode) => {
            resolve({ code: childCode || 0, output: logData });
          });
        });
      };

      // Find which pip command works
      let pipCmd = "";
      let pipArgs: string[] = [];
      let diagLog = "--- Pip Autodetect Log ---\n";

      const check1 = await runCommand("python3", ["-m", "pip", "--version"]);
      diagLog += `python3 -m pip check: code ${check1.code}, output: ${check1.output.trim()}\n`;
      if (check1.code === 0) {
        pipCmd = "python3";
        pipArgs = ["-m", "pip"];
      }

      if (!pipCmd) {
        const check2 = await runCommand("pip3", ["--version"]);
        diagLog += `pip3 check: code ${check2.code}, output: ${check2.output.trim()}\n`;
        if (check2.code === 0) {
          pipCmd = "pip3";
          pipArgs = [];
        }
      }

      if (!pipCmd) {
        const check3 = await runCommand("pip", ["--version"]);
        diagLog += `pip check: code ${check3.code}, output: ${check3.output.trim()}\n`;
        if (check3.code === 0) {
          pipCmd = "pip";
          pipArgs = [];
        }
      }

      if (!pipCmd) {
        const check4 = await runCommand("python", ["-m", "pip", "--version"]);
        diagLog += `python -m pip check: code ${check4.code}, output: ${check4.output.trim()}\n`;
        if (check4.code === 0) {
          pipCmd = "python";
          pipArgs = ["-m", "pip"];
        }
      }

      if (!pipCmd) {
        diagLog += "ERROR: No pip command found in the system!\n";
        await fs.writeFile(path.join(process.cwd(), "pip_install.log"), diagLog, "utf-8");
        console.error("No pip command found in system. Unable to install Python requirements.");
        launchAPI();
        return;
      }

      diagLog += `Selected pip command: ${pipCmd} ${pipArgs.join(" ")}\n\n`;

      // Try regular install first
      console.log(`Installing requirements using: ${pipCmd} ${pipArgs.concat(["install", "-r", "requirements.txt"]).join(" ")}`);
      const install1 = await runCommand(pipCmd, [...pipArgs, "install", "-r", "requirements.txt"]);
      diagLog += `--- Install Attempt 1 ---\nCode: ${install1.code}\nOutput:\n${install1.output}\n\n`;
      
      let success = (install1.code === 0);

      if (!success) {
        console.log("Standard pip install failed. Trying with --break-system-packages...");
        const install2 = await runCommand(pipCmd, [...pipArgs, "install", "-r", "requirements.txt", "--break-system-packages"]);
        diagLog += `--- Install Attempt 2 (--break-system-packages) ---\nCode: ${install2.code}\nOutput:\n${install2.output}\n\n`;
        success = (install2.code === 0);
      }
      
      if (!success) {
        console.log("Trying with --user --break-system-packages...");
        const install3 = await runCommand(pipCmd, [...pipArgs, "install", "--user", "-r", "requirements.txt", "--break-system-packages"]);
        diagLog += `--- Install Attempt 3 (--user --break-system-packages) ---\nCode: ${install3.code}\nOutput:\n${install3.output}\n\n`;
        success = (install3.code === 0);
      }

      await fs.writeFile(path.join(process.cwd(), "pip_install.log"), diagLog, "utf-8");
      console.log(`Pip installation finished. Log written to pip_install.log.`);
      launchAPI();
    } else {
      console.log("Python dependencies verified successfully.");
      launchAPI();
    }
  });
}

function launchAPI() {
  console.log("Starting Python API server (api.py)...");
  const pythonProcess = spawn("python3", ["api.py"], {
    stdio: "inherit",
    detached: false
  });

  pythonProcess.on("error", (err) => {
    console.error("Failed to start Python API server:", err);
  });

  process.on("exit", () => {
    pythonProcess.kill();
  });
}

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function generateContentWithRetryAndFallback(ai: GoogleGenAI, image: string, mimeType: string) {
  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    let attempts = 2; // Try twice per model
    let delay = 500; // ms

    while (attempts > 0) {
      try {
        console.log(`Attempting analysis with model ${modelName} (${attempts} attempts left)...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                data: image,
                mimeType: mimeType || "image/jpeg",
              },
            },
            {
              text: "Analyze this traffic scene image. Detect all vehicles (cars, trucks, buses, motorcycles, SUVs, etc.). Read each license plate exactly as physically printed on the vehicle. CRITICAL ACCURACY REQUIREMENT: Do not guess, speculate, or hallucinate characters. If a license plate is blurry, distant, shadowed, obscured, or otherwise not 100% clearly readable, you MUST leave the 'plate' field as an empty string (''). Only output plate characters that are perfectly visible and legible. Provide bounding box percentage coordinates (ymin, xmin, ymax, xmax) from 0 to 100 relative to the image dimensions.",
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "Type of vehicle, e.g. 'Car', 'Bus', 'Motorcycle', 'SUV', 'Truck'.",
                  },
                  plate: {
                    type: Type.STRING,
                    description: "License plate number. Read accurately. If blurry or unreadable, set to an empty string.",
                  },
                  confidence: {
                    type: Type.INTEGER,
                    description: "Estimated percentage confidence score (0-100).",
                  },
                  color: {
                    type: Type.STRING,
                    description: "Primary color of the vehicle (e.g. 'Black', 'Yellow', 'Red').",
                  },
                  brand: {
                    type: Type.STRING,
                    description: "Brand, model or description of the vehicle.",
                  },
                  box: {
                    type: Type.OBJECT,
                    description: "Bounding box percentage coordinates from 0 to 100 relative to image dimensions.",
                    properties: {
                      ymin: { type: Type.INTEGER, description: "Top coordinate % (0-100)" },
                      xmin: { type: Type.INTEGER, description: "Left coordinate % (0-100)" },
                      ymax: { type: Type.INTEGER, description: "Bottom coordinate % (0-100)" },
                      xmax: { type: Type.INTEGER, description: "Right coordinate % (0-100)" },
                    },
                    required: ["ymin", "xmin", "ymax", "xmax"],
                  },
                },
                required: ["type", "plate", "confidence", "color", "brand", "box"],
              },
            },
          },
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("No response text returned from Gemini API");
        }
        return JSON.parse(resultText.trim());
      } catch (error: any) {
        lastError = error;
        console.warn(`Error using model ${modelName}:`, error.message || error);
        
        // Inspect error status or code (503 or 429)
        const status = error.status || (error.error && error.error.code);
        const errMsg = (error.message || "").toLowerCase();
        
        if (status === 503 || status === 429 || errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("unavailable") || errMsg.includes("demand")) {
          attempts--;
          if (attempts > 0) {
            console.log(`Transient error. Retrying model ${modelName} in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 1.5; // Backoff
            continue;
          }
        }
        
        // For non-transient error or exhausted attempts, fall back to next model
        break;
      }
    }
  }

  throw lastError || new Error("Failed to analyze image using all available models");
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Start the Python Flask API server
  startBackendAPI();

  // Diagnostic endpoints to troubleshoot Python dependencies
  app.get("/api/python-diag", async (req, res) => {
    try {
      const execPromise = (cmd: string, args: string[]) => {
        return new Promise((resolve) => {
          const child = spawn(cmd, args);
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (data) => { stdout += data.toString(); });
          child.stderr?.on("data", (data) => { stderr += data.toString(); });
          
          child.on("error", (err) => {
            stderr += `\nError spawning ${cmd}: ${err.message}\n`;
            resolve({ code: -1, stdout, stderr });
          });

          child.on("close", (code) => {
            resolve({ code, stdout, stderr });
          });
        });
      };

      const pyVersion = await execPromise("python3", ["--version"]);
      const pipVersion = await execPromise("python3", ["-m", "pip", "--version"]);
      const pipList = await execPromise("python3", ["-m", "pip", "list"]);
      const checkImport = await execPromise("python3", ["-c", "import uvicorn, fastapi; print('Successfully imported')"]);

      return res.json({
        pyVersion,
        pipVersion,
        pipList,
        checkImport
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/python-install", async (req, res) => {
    try {
      const child = spawn("python3", ["-m", "pip", "install", "-r", "requirements.txt"]);
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (data) => { stdout += data.toString(); });
      child.stderr?.on("data", (data) => { stderr += data.toString(); });
      
      child.on("error", (err) => {
        stderr += `\nError spawning pip: ${err.message}\n`;
      });
      
      const code = await new Promise((resolve) => {
        child.on("close", resolve);
        child.on("error", () => resolve(-1));
      });

      return res.json({ code, stdout, stderr });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Middleware to support base64 file uploads up to 20MB
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  // API Route to analyze uploaded traffic scene images via YOLO11 / Roboflow engine
  app.post("/api/analyze-feed", async (req, res) => {
    try {
      const { image, mimeType, roboflowApiKey } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data" });
      }

      // First Priority: Forward to local Python YOLO11 / Roboflow computer vision engine
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for YOLO11 neural engine
        
        const response = await fetch("http://127.0.0.1:5000/api/analyze-feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, mimeType, roboflowApiKey }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.detections && Array.isArray(data.detections) && data.detections.length > 0) {
            return res.json(data);
          }
          console.warn("Python YOLO11 returned 0 detections. Attempting Gemini AI vision fallback...");
        } else {
          console.warn(`Python YOLO11 API returned error status ${response.status}.`);
        }
      } catch (pyErr: any) {
        console.info("Python YOLO11 engine connecting/initializing:", pyErr.message || pyErr);
      }

      // Secondary Fallback if Python engine is offline: Gemini API
      const key = process.env.GEMINI_API_KEY;
      if (key) {
        try {
          console.warn("Using Gemini fallback for vehicle detection...");
          const ai = getGemini();
          const detections = await generateContentWithRetryAndFallback(ai, image, mimeType);
          return res.json({ detections, fallbackUsed: true, engine: "Gemini-Fallback" });
        } catch (geminiError: any) {
          console.warn("Gemini API fallback also failed:", geminiError.message || geminiError);
        }
      }

      return res.json({
        detections: [],
        fallbackUsed: true,
        error: "YOLO11 engine is currently initializing. Please try again in a few seconds."
      });

    } catch (error: any) {
      console.error("Error analyzing image:", error);
      return res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // API Route to fetch real-time traffic statistics (proxies Flask or reads shared stats)
  app.get("/api/stats", async (req, res) => {
    try {
      // 1. Try to fetch from the Python Flask API running on port 5000
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2000ms timeout

      try {
        const response = await fetch("http://127.0.0.1:5000/api/stats", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const stats = await response.json();
          if (stats && typeof stats === "object") {
            return res.json(stats);
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
      }

      // 2. Fallback: Read directly from the shared live_stats.json file
      const filePath = path.join(process.cwd(), "database", "live_stats.json");

      try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const stats = JSON.parse(fileContent);
        return res.json(stats);
      } catch (fileError) {
        // 3. Realistic default if no files/databases have been populated yet
        return res.json({
          live_count: 0,
          avg_speed: 48.0,
          plates_detected: 0,
          active_alerts: 0,
          flow_status: "No Traffic"
        });
      }
    } catch (error: any) {
      console.error("Error fetching stats:", error);
      return res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Dedicated API Route for /api/traffic-metrics
  app.get("/api/traffic-metrics", async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2000ms timeout

      try {
        const response = await fetch("http://127.0.0.1:5000/api/traffic-metrics", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const stats = await response.json();
          if (stats && typeof stats === "object") {
            return res.json(stats);
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
      }

      // Fallback
      const filePath = path.join(process.cwd(), "database", "live_stats.json");
      try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const stats = JSON.parse(fileContent);
        return res.json(stats);
      } catch (fileError) {
        return res.json({
          live_count: 0,
          avg_speed: 48.0,
          plates_detected: 0,
          active_alerts: 0,
          flow_status: "No Traffic"
        });
      }
    } catch (error: any) {
      console.error("Error fetching traffic metrics:", error);
      return res.status(500).json({ error: "Failed to fetch traffic metrics" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
