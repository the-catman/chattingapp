const readline = require('readline');
const { writeFileSync } = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let config = require("./config.json");

rl.question(`Enter new password:\n`, password => {
    config.hashedPassword = require('crypto').createHash("sha512").update(password + config.salt).digest('hex');
    writeFileSync("./config.json", JSON.stringify(config, null, '\t'));
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
    rl.close();
});
