const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const Module = require("./public/edge-impulse-standalone.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

/* =========================
   CONFIG
========================= */
const SAMPLE_RATE = 16000;
const WINDOW_MS = 1200;
const STRIDE_MS = 300;

const WINDOW_SIZE = Math.floor((SAMPLE_RATE * WINDOW_MS) / 1000);
const STRIDE_SIZE = Math.floor((SAMPLE_RATE * STRIDE_MS) / 1000);

/* =========================
   STATE
========================= */
let classifier = null;
let modelReady = false;

let wasmPtr = null;
let wasmView = null;

/* =========================
   RESULT PARSER
========================= */
function parseResult(ret) {
    if (!ret) return { error: "empty result" };

    const out = {
        anomaly: ret.anomaly ?? null,
        results: []
    };

    if (ret.classification?.size) {
        for (let i = 0; i < ret.classification.size(); i++) {
            const c = ret.classification.get(i);
            out.results.push({
                label: c.label,
                value: c.value
            });
        }
    } else if (ret.results) {
        out.results = ret.results;
    }

    return out;
}

/* =========================
   RING BUFFER
========================= */
function createRingBuffer(size) {
    return {
        buffer: new Float32Array(size),
        write: 0,
        filled: 0
    };
}

function pushSamples(ring, samples) {
    for (let i = 0; i < samples.length; i++) {
        ring.buffer[ring.write] = samples[i];
        ring.write = (ring.write + 1) % ring.buffer.length;
        ring.filled = Math.min(ring.filled + 1, ring.buffer.length);
    }
}

function linearize(ring) {
    const out = new Float32Array(ring.buffer.length);

    const tail = ring.buffer.subarray(ring.write);
    const head = ring.buffer.subarray(0, ring.write);

    out.set(tail, 0);
    out.set(head, tail.length);

    return out;
}

/* =========================
   SAFE INFERENCE
========================= */
let inferenceBusy = false;

function runInference(ring, ws) {
    if (inferenceBusy || !modelReady) return;
    if (ring.filled < WINDOW_SIZE) return;

    inferenceBusy = true;

    setImmediate(() => {
        try {
            const linear = linearize(ring);

            wasmView.set(linear);

            const result = classifier.run(wasmPtr, WINDOW_SIZE, false);

            const clean = parseResult(result);

            ws.send(JSON.stringify(clean));

        } catch (e) {
            console.error("Inference error:", e);
        } finally {
            inferenceBusy = false;
        }
    });
}

/* =========================
   WEBSOCKET
========================= */
wss.on("connection", (ws) => {
    console.log("📡 client connected");

    const ring = createRingBuffer(WINDOW_SIZE);

    let strideCounter = 0;

    ws.on("message", (msg) => {
        if (!modelReady) return;

        try {
            const samples = new Float32Array(JSON.parse(msg));

            pushSamples(ring, samples);

            strideCounter += samples.length;

            if (strideCounter < STRIDE_SIZE) return;

            strideCounter = 0;

            runInference(ring, ws);

        } catch (err) {
            console.error("WS error:", err.message);
        }
    });

    ws.on("close", () => {
        console.log("📴 client disconnected");
    });
});

/* =========================
   WASM INIT (CRITICAL FIX)
========================= */
Module.onRuntimeInitialized = () => {
    try {
        classifier = {
            run: Module.run_classifier,
            getProps: Module.get_properties
        };

        console.log("✅ WASM runtime ready");
        console.log(classifier.getProps?.());

        // 🔥 SAFE ALLOCATION (ONLY HERE)
        wasmPtr = Module._malloc(WINDOW_SIZE * 4);

        wasmView = new Float32Array(
            Module.HEAPF32.buffer,
            wasmPtr,
            WINDOW_SIZE
        );

        modelReady = true;

        console.log("🧠 WASM buffer allocated");

    } catch (e) {
        console.error("WASM init failed:", e);
    }
};

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 server running on port ${PORT}`);
});
