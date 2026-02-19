const fs = require("node:fs");

fs.writeFileSync("config.json", `{
	"logDebug": true,
	"logError": true,
	"keyDir": "",
	"certDir": "",
	"useHttps": false,
	"port": 8443
}`);