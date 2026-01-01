const WebSocket = require("ws");
const https = require("https");
const { readFileSync } = require("fs");

const config = require("./config.json");

function callBack(req, res) {
    res.writeHead(200);
    res.end(readFileSync(config.client, "utf-8"));
}

function debug(...args) {
    if (config.logDebug) console.log("DEBUG::", ...args);
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
            client.send(JSON.stringify({
                type: "anotherConnected"
            }));
        } else {
            client.send(JSON.stringify({
                type: "connectedUsers",
                userAmount: wss.clients.size
            }));
        }
    });

    ws.onclose = function (closeEvent) {
        debug(`Client disconnected, code: ${closeEvent.code}, reason: ${closeEvent.reason}`);

        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(JSON.stringify({
                    type: "anotherDisconnected"
                }));
            }
        });
    }

    ws.onmessage = function ({ data }) {
        if (typeof data !== "string") {
            ws.close(1007, "Data must be of type string.");
            return;
        }

        let parsed;

        try {
            parsed = JSON.parse(String(data));
        } catch (err) {
            ws.close(1007, "Invalid JSON.");
            return;
        }

        switch (String(parsed.type)) {
            case "message":
                {
                    wss.clients.forEach(client => {
                        client.send(JSON.stringify({
                            type: "broadcast",
                            content: parsed.content,
                            iv: parsed.iv,
                            you: client === ws
                        }));
                    });

                    break;
                }

            case "file":
                {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: "file",
                                content: parsed.content,
                                iv: parsed.iv,
                                fileName: parsed.fileName,
                                you: client === ws,
                                isImg: parsed.isImg
                            }));
                        }
                    });
                    break;
                }

            default:
                {
                    ws.close(1002, `Unknown packet type: \`${parsed.type}\`.`);
                    return;
                }
        }
    }
});

server.listen(config.port, () => {
    debug("Server up and running!");
});