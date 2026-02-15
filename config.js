const fs = require("node:fs");

fs.writeFileSync("config.json", `{
	"logDebug": true,
	"logError": true,
	"keyDir": "",
	"certDir": "",
	"port": 8443
}`);