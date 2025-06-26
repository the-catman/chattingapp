const WebSocket = require("ws");

const http = require("http");
const https = require("https");
const { readFileSync } = require("fs");
const { createHash } = require('crypto');

const config = require("./config.json");

function callBack(req, res) {
    res.writeHead(200);
    res.end(readFileSync(config.client, { encoding: 'utf-8' }));
}

const serveerSSLSettings = {
    key: readFileSync(config.keyDir),
    cert: readFileSync(config.certDir)
};

const server = config.useHTTPS ? (https.createServer(serveerSSLSettings, callBack)) : (http.createServer(callBack));

const wss = new WebSocket.Server({
    server,
    maxPayload: config.maxPayload
});

function debug(...args) {
    if (config.logDebug) console.log(...args);
}

wss.on('connection', (ws, req) => {
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

    if(wss.clients.size > config.maxConnections) {
        debug("Client rejected because max number of connections was exceeded.");
        ws.close(1002, "Max number of connections was exceeded.");
        return;
    }

    debug("Client connected.");

    ws.onclose = function (closeEvent) {
        debug("Client disconnected, code: " + closeEvent.code, "reason: " + closeEvent.reason);

        wss.clients.forEach((client) => {
            if (client !== ws) {
                client.send(JSON.stringify({
                    type: 'anotherDisconnected',
                    ip
                }));
            }
        });
    }

    ws.onmessage = function ({ data }) {
        if (typeof data !== 'string') {
            ws.close(1007, "Data type must be of type: 'string'.");
            return;
        }
        try {
            var parsed = JSON.parse(String(data));
        } catch (err) {
            ws.close(1007, "Invalid JSON!");
            return;
        }
        switch (String(parsed.type)) {
            case 'init':
                {
                    if (ws.verified || (createHash("sha512").update(String(parsed.password) + config.salt).digest('hex') !== config.hashedPassword)) {
                        ws.close(1002, "Incorrect verification.");
                        return;
                    }
                    debug("Client verified: " + ip);
                    ws.verified = true;
                    ws.send(JSON.stringify({
                        type: 'accepted'
                    }));
                    wss.clients.forEach((client) => {
                        if (client !== ws) {
                            client.send(JSON.stringify({
                                type: 'anotherConnected',
                                ip
                            }));
                        } else {
                            client.send(JSON.stringify({
                                type: 'connectedUsers',
                                userAmount: wss.clients.size,
                                ip
                            }));
                        }
                    });
                    break;
                }
            case 'message':
                {
                    let msg = String(parsed.content).trim().slice(0, 0xffff);
                    if (msg !== "") {
                        wss.clients.forEach((client) => {
                            if (client.verified) {
                                client.send(JSON.stringify({
                                    type: 'broadcast',
                                    content: msg,
                                    you: client === ws,
                                    senderIP: ip
                                }));
                            }
                        });
                    }
                    break;
                }
            case 'file':
                {
                    parsed.content = String(parsed.content);
                    parsed.isImg = Boolean(parsed.isImg);
                    parsed.fileName = String(parsed.fileName);
                    if (parsed.content && (parsed.isImg || parsed.fileName)) {
                        wss.clients.forEach((client) => {
                            if (client.verified) {
                                client.send(JSON.stringify({
                                    type: 'file',
                                    content: parsed.content,
                                    fileName: parsed.fileName,
                                    you: client === ws,
                                    senderIP: ip,
                                    isImg: parsed.isImg
                                }));
                            }
                        });
                    }
                    break;
                }
            case 'complaint':
                {
                    const complaint = config.complaints[Number(a)];
                    debug(`Client has a complaint: ${complaint}\nComplaint message: ${String(parsed.message)}`);
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