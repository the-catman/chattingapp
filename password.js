const readline = require('readline');
const { writeFileSync } = require('fs');
const crypto = require('crypto');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let config = require("./config.json");

rl.question('Enter new password:\n', password => {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 100000;
    const keylen = 64;
    const digest = 'sha3-256';

    const hashedPassword = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');

    config.hashedPassword = hashedPassword;
    config.salt = salt;
    config.iterations = iterations;
    config.keylen = keylen;
    config.digest = digest;

    writeFileSync("./config.json", JSON.stringify(config, null, '\t'));
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
    rl.close();
});
