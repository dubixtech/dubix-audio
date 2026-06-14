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

/* =========================
   INIT MODEL
========================= */
Module.onRuntimeInitialized = () => {
    try {
        classifier = {
            run: Module.run_classifier,
            getProps: Module.get_properties
        };
        modelReady = true;
        console.log("✅ Edge Impulse WASM loaded");
        if (classifier.getProps) {
            console.log("Model info:", classifier.getProps());
        }
    } catch (e) {
        console.error("WASM init failed", e);
    }
};

/* Helper: array to WASM heap */
function arrayToHeap(data) {
    const numBytes = data.length * 4;
    const ptr = Module._malloc(numBytes);
    Module.HEAPF32.set(data, ptr / 4);
    return { ptr, size: data.length };
}

/* Parse WASM result into clean JS object */
function parseResult(ret) {
    if (!ret) return { error: "No result" };

    const result = {
        anomaly: ret.anomaly !== undefined ? ret.anomaly : null,
        results: []
    };

    // Handle classification results
    if (ret.classification && typeof ret.classification.size === 'function') {
        for (let i = 0; i < ret.classification.size(); i++) {
            const c = ret.classification.get(i);
            result.results.push({
                label: c.label,
                value: c.value
            });
        }
    } else if (ret.results) {
        result.results = ret.results;
    }

    return result;
}

/* =========================
   WEBSOCKET
========================= */
wss.on("connection", (ws) => {
    console.log("📡 Client connected");

    const audioBuffer = new Float32Array(WINDOW_SIZE);
    let writeIndex = 0;
    let strideCounter = 0;
    let totalSamples = 0;

    ws.on("message", (msg) => {
        if (!modelReady) return;

        try {
            const samples = new Float32Array(JSON.parse(msg));

            // Fill rolling buffer
            for (let i = 0; i < samples.length; i++) {
                audioBuffer[writeIndex] = samples[i];
                writeIndex = (writeIndex + 1) % WINDOW_SIZE;
            }

            totalSamples += samples.length;
            strideCounter += samples.length;

            if (strideCounter >= STRIDE_SIZE && totalSamples >= WINDOW_SIZE) {
                strideCounter = 0;

                const heap = arrayToHeap(audioBuffer);
                const debug = true;                    // ← Enable debug for now

                const rawResult = classifier.run(heap.ptr, heap.size, debug);
                Module._free(heap.ptr);

                const cleanResult = parseResult(rawResult);
                ws.send(JSON.stringify(cleanResult));

                // Log on server for debugging
                console.log("Prediction sent:", cleanResult);
            }
        } catch (err) {
            console.error("Processing error:", err.message);
        }
    });

    ws.on("close", () => console.log("📴 Client disconnected"));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
