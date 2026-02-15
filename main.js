const WebSocket = require("ws");
const https = require("https");
const { readFileSync } = require("fs");
const path = require("node:path");
const OAB = require("./lib/OAB.js");

const config = require("./config.json");

function callBack(req, res) {
    let filePath;
    let contentType = "text/html";

    switch (req.url) {
        case "/OAB.js":
            filePath = path.join(__dirname, "lib", "OAB.js");
            contentType = "application/javascript";
            break;

        case "/index.js":
            filePath = path.join(__dirname, "client", "index.js");
            contentType = "application/javascript";
            break;

        case "/style.css":
            filePath = path.join(__dirname, "client", "style.css");
            contentType = "text/css";
            break;

        case "/notification.mp3":
            filePath = path.join(__dirname, "client", "notification.mp3");
            contentType = "audio/mpeg";
            break;

        default:
            filePath = "./client.html";
            contentType = "text/html";
            break;
    }

    try {
        const data = (contentType.startsWith("text/") || contentType === "application/javascript")
            ? readFileSync(filePath, "utf-8")
            : readFileSync(filePath);

        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    } catch (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
    }
}

function debug(...args) {
    if (config.logDebug) console.log("DEBUG::", ...args);
}

function error(...args) {
    if (config.logErrors) console.log("ERROR::", ...args);
}

const server = https.createServer({
    key: readFileSync(config.keyDir),
    cert: readFileSync(config.certDir)
}, callBack);

const wss = new WebSocket.Server({
    server,
    maxPayload: 10000000, // 10 MB
    verifyClient: (info, done) => {
        if (wss.clients.size >= 2) {
            done(false);
        } else {
            done(true);
        }
    }
});

const cachedPackets = [
    new OAB.Writer().string("connected").out(),
    new OAB.Writer().string("disconnected").out()
];

wss.on("connection", (ws, req) => {
    debug("Client connected.");

    wss.clients.forEach((client) => {
        if (client !== ws) {
            client.send(cachedPackets[0]);
        } else {
            client.send(
                new OAB.Writer()
                    .string("users")
                    .vu(wss.clients.size)
                    .out()
            );
        }
    });

    ws.onclose = function (closeEvent) {
        debug(`Client disconnected, code: ${closeEvent.code}, reason: ${closeEvent.reason}`);

        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(cachedPackets[1]);
            }
        });
    }

    ws.onmessage = function (message) {
        const data = new Uint8Array(message.data)
        const reader = new OAB.Reader(data);

        try {
            const packetType = reader.string();
            switch (packetType) {
                case "message":
                    {
                        const messageText = reader.string();

                        wss.clients.forEach(client => {
                            client.send(
                                new OAB.Writer()
                                    .string("message")
                                    .byte(client === ws)
                                    .string(messageText)
                                    .out()
                            );
                        });

                        break;
                    }

                case "file":
                    {
                        const isImg = reader.byte();
                        const fileName = reader.string();
                        const fileData = reader.bytes();

                        wss.clients.forEach(client => {
                            client.send(
                                new OAB.Writer()
                                    .string("file")
                                    .byte(client === ws)
                                    .byte(isImg)
                                    .string(fileName)
                                    .bytes(fileData)
                                    .out()
                            );
                        });

                        break;
                    }

                default:
                    {
                        ws.close(1002, `Unknown packet type: \`${parsed.type}\`.`);
                        return;
                    }
            }
        } catch (err) {
            ws.close(1007, "Invalid Data.");
            error(err);
            return;
        }
    }
});

server.listen(config.port, () => {
    debug("Server up and running!");
});
