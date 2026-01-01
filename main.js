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

        default:
            filePath = "./client.html";
            contentType = "text/html";
            break;
    }

    try {
        const data = readFileSync(filePath, "utf-8");
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
    maxPayload: config.maxPayload
});

wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    ws.ip = ip;

    if (config.noSameIP) {
        for (const client of wss.clients) {
            if ((ws !== client) && (client.ip === req.socket.remoteAddress)) {
                debug("Client rejected because IP is already in use.");
                ws.close(1002, "IP already in use.");
                return;
            }
        }
    }

    if (wss.clients.size > config.maxConnections) {
        debug("Client rejected because max number of connections was exceeded.");
        ws.close(1002, "Max number of connections was exceeded.");
        return;
    }

    debug("Client connected.");

    wss.clients.forEach((client) => {
        if (client !== ws) {
            client.send(
                new OAB.Writer()
                    .string("anotherConnected")
                    .out()
            );
        } else {
            client.send(
                new OAB.Writer()
                    .string("connectedUsers")
                    .vu(wss.clients.size)
                    .out()
            );
        }
    });

    ws.onclose = function (closeEvent) {
        debug(`Client disconnected, code: ${closeEvent.code}, reason: ${closeEvent.reason}`);

        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(
                    new OAB.Writer()
                        .string("anotherDisconnected")
                        .out()
                );
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
                        const cipherText = reader.bytes();
                        const iv = reader.bytes();

                        wss.clients.forEach(client => {
                            client.send(
                                new OAB.Writer()
                                    .string("message")
                                    .byte(client === ws)
                                    .bytes(cipherText)
                                    .bytes(iv)
                                    .out()
                            );
                        });

                        break;
                    }

                case "file":
                    {
                        const isImg = reader.byte();
                        const fileName = reader.string();
                        const cipherText = reader.bytes();
                        const iv = reader.bytes();

                        wss.clients.forEach(client => {
                            client.send(
                                new OAB.Writer()
                                    .string("file")
                                    .byte(client === ws)
                                    .byte(isImg)
                                    .string(fileName)
                                    .bytes(cipherText)
                                    .bytes(iv)
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