const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const Module = require("./public/edge-impulse-standalone.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

/* =========================
   MODEL CONFIG
========================= */
const SAMPLE_RATE = 16000;
const WINDOW_MS = 1200;     // Keep 1.2 second window
const STRIDE_MS = 300;      // ← CHANGED: Now every 300ms

const WINDOW_SIZE = Math.floor((SAMPLE_RATE * WINDOW_MS) / 1000);   // 19200
const STRIDE_SIZE = Math.floor((SAMPLE_RATE * STRIDE_MS) / 1000);   // 4800  ← New stride size

let classifier = null;
let modelReady = false;

/* =========================
   INIT EDGE IMPULSE MODEL
========================= */
Module.onRuntimeInitialized = () => {
    try {
        classifier = {
            run: Module.run_classifier,
            getProps: Module.get_properties
        };
        modelReady = true;
        console.log("✅ Edge Impulse WASM model loaded");
        console.log(`Model ready - Window: ${WINDOW_MS}ms | Stride: ${STRIDE_MS}ms`);
    } catch (err) {
        console.error("❌ Failed to initialize classifier:", err);
    }
};

/* =========================
   WEBSOCKET SERVER
========================= */
wss.on("connection", (ws) => {
    console.log("📡 Client connected");

    const audioBuffer = new Float32Array(WINDOW_SIZE);
    let writeIndex = 0;
    let strideCounter = 0;

    ws.on("message", (msg) => {
        if (!modelReady) {
            ws.send(JSON.stringify({ error: "Model not ready" }));
            return;
        }

        try {
            const samples = new Float32Array(JSON.parse(msg));

            // Add new samples to circular buffer
            for (let i = 0; i < samples.length; i++) {
                audioBuffer[writeIndex] = samples[i];
                writeIndex = (writeIndex + 1) % WINDOW_SIZE;
            }

            strideCounter += samples.length;

            // Run inference every STRIDE_SIZE samples (300ms)
            if (strideCounter >= STRIDE_SIZE) {
                strideCounter = 0;

                // Only run when we have at least one full window
                const input = audioBuffer.slice();
                const result = classifier.run(input, false);
                
                ws.send(JSON.stringify(result));
            }
        } catch (err) {
            console.error("Error processing audio:", err);
            ws.send(JSON.stringify({ error: "Invalid data" }));
        }
    });

    ws.on("close", () => console.log("📴 Client disconnected"));
    ws.on("error", (err) => console.error("WS Error:", err));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`Inference every ${STRIDE_MS}ms with ${WINDOW_MS}ms window`);
});
