import http from "http"
import WebSocket, { WebSocketServer } from "ws"

const PORT = process.env.PORT || 3000

// buffer to store received audio
let audioChunks = []

// ---------- WAV HEADER ----------
function createWavHeader(dataLength, sampleRate = 16000, channels = 1, bits = 16) {

    const blockAlign = channels * bits / 8
    const byteRate = sampleRate * blockAlign
    const buffer = Buffer.alloc(44)

    buffer.write("RIFF", 0)
    buffer.writeUInt32LE(36 + dataLength, 4)
    buffer.write("WAVE", 8)
    buffer.write("fmt ", 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(channels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bits, 34)
    buffer.write("data", 36)
    buffer.writeUInt32LE(dataLength, 40)

    return buffer
}

// ---------- HTTP SERVER ----------
const server = http.createServer((req, res) => {

    if (req.url === "/audio") {

        const pcm = Buffer.concat(audioChunks)

        const header = createWavHeader(pcm.length)

        const wav = Buffer.concat([header, pcm])

        res.writeHead(200, {
            "Content-Type": "audio/wav",
            "Content-Length": wav.length
        })

        res.end(wav)

        return
    }

    if (req.url === "/clear") {

        audioChunks = []
        res.end("Audio buffer cleared")
        return
    }

    res.end("WSS Audio Server Running")
})

// ---------- WEBSOCKET ----------
const wss = new WebSocketServer({ server })

wss.on("connection", (ws) => {

    console.log("ESP32 connected")

    ws.on("message", (data, isBinary) => {

        if (isBinary) {

            audioChunks.push(data)

            console.log("received audio:", data.length)

        } else {

            console.log("text:", data.toString())
        }
    })

    ws.on("close", () => {
        console.log("client disconnected")
    })
})

// ---------- START ----------
server.listen(PORT, () => {
    console.log("Server running on", PORT)
})
