const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const Module = require("./public/edge-impulse-standalone.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

/* =========================
   MODEL CONFIG
========================= */
const SAMPLE_RATE = 16000;
const WINDOW_MS = 1200;
const STRIDE_MS = 300;

const WINDOW_SIZE = Math.floor((SAMPLE_RATE * WINDOW_MS) / 1000);
const STRIDE_SIZE = Math.floor((SAMPLE_RATE * STRIDE_MS) / 1000);

let classifier = null;
let modelReady = false;

Module.onRuntimeInitialized = () => {
    try {
        classifier = {
            run: Module.run_classifier,
            getProps: Module.get_properties
        };
        modelReady = true;
        console.log("✅ Edge Impulse WASM loaded successfully");
    } catch (e) {
        console.error("❌ WASM init failed", e);
    }
};

/* =========================
   WEBSOCKET
========================= */
wss.on("connection", (ws) => {
    console.log("📡 Client connected");

    const audioBuffer = new Float32Array(WINDOW_SIZE);
    let writeIndex = 0;
    let strideCounter = 0;

    ws.on("message", (msg) => {
        if (!modelReady) return;

        try {
            const samples = new Float32Array(JSON.parse(msg));

            for (let i = 0; i < samples.length; i++) {
                audioBuffer[writeIndex] = samples[i];
                writeIndex = (writeIndex + 1) % WINDOW_SIZE;
            }

            strideCounter += samples.length;

            if (strideCounter >= STRIDE_SIZE) {
                strideCounter = 0;
                const input = audioBuffer.slice();
                const result = classifier.run(input, false);
                ws.send(JSON.stringify(result));
            }
        } catch (err) {
            console.error("Processing error:", err.message);
        }
    });

    ws.on("close", () => console.log("📴 Client disconnected"));
});

/* =========================
   START SERVER (Important for Render)
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 WebSocket ready`);
});
