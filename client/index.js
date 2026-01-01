const sendBtn = document.getElementById("sendBtn");
const statusTxt = document.getElementById("statusTxt");
const messageInput = document.getElementById("messageInput");
const chatMessages = document.getElementById("chatMessages");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");
const setPasswordBtn = document.getElementById("setPasswordBtn");
const passwordInput = document.getElementById("passwordInput");
const passwordNotice = document.getElementById("passwordNotice");

messageInput.disabled = true;
sendBtn.disabled = true;
sendFileBtn.disabled = true;
passwordNotice.style.display = "block";

const salt = "e2ee-chat-v2";

const enc = new TextEncoder();
const dec = new TextDecoder();

let ws, passwordKey;

// # ---- MAIN LOOP ---- #

setTimeout(async function connect() {
    ws = new WebSocket(window.location.protocol.replace("http", "ws") + "//" + location.host);
    ws.binaryType = "arraybuffer";
    statusTxt.textContent = "Status: Attempting connection...";

    ws.onclose = function (closeEvent) {
        statusTxt.textContent = `Status: Disconnected, reason: ${(closeEvent.reason || "None.")}`;
        console.log(closeEvent);
        setTimeout(connect, 5000);
    }

    ws.onerror = function () {
        statusTxt.textContent = "Status: Errored.";
    }

    ws.onmessage = async function (message) {
        const data = new Uint8Array(message.data);
        const reader = new OAB.Reader(data);
        const packetType = reader.string();

        switch (packetType) {
            case "anotherConnected":
                {
                    receiveMessage("Unknown has joined the chat.");
                    break;
                }

            case "anotherDisconnected":
                {
                    receiveMessage("Unknown has left the chat.");
                    break;
                }

            case "connectedUsers":
                {
                    receiveMessage(`Number of connected users: ${reader.vu()}`);
                    break;
                }

            case "message":
                {
                    const person = reader.byte() ? "You" : "Unknown";
                    const cipherText = reader.bytes().buffer;
                    const iv = reader.bytes().buffer;

                    try {
                        const decrypted = await crypto.subtle.decrypt(
                            { name: "AES-GCM", iv },
                            passwordKey,
                            cipherText
                        );
                        receiveMessage(`${person}: ${dec.decode(decrypted)}`);
                    } catch (err) {
                        console.warn("Failed to decrypt message:", err);
                        receiveMessage("Could not decrypt a message (wrong password or corrupted data).");
                    }

                    break;
                }

            case "file":
                {
                    const person = reader.byte() ? "You" : "Unknown";
                    const isImg = reader.byte();
                    const fileName = reader.string();
                    const cipherText = reader.bytes().buffer;
                    const iv = reader.bytes().buffer;

                    let newMsg = document.createElement("p");

                    try {
                        const decryptedBuffer = await crypto.subtle.decrypt(
                            { name: "AES-GCM", iv },
                            passwordKey,
                            cipherText
                        );

                        if (isImg) {
                            const blob = new Blob([decryptedBuffer]);
                            const url = URL.createObjectURL(blob);
                            const img = document.createElement("img");
                            img.src = url;
                            img.style.maxWidth = "100%";
                            img.style.height = "auto";
                            newMsg.appendChild(document.createTextNode(`${person}: `));
                            newMsg.appendChild(img);
                        } else {
                            const blob = new Blob([decryptedBuffer]);
                            const url = URL.createObjectURL(blob);
                            const fileLink = document.createElement("a");
                            fileLink.href = url;
                            fileLink.download = fileName;
                            fileLink.textContent = fileName;
                            fileLink.style.color = "#007bff";
                            fileLink.style.textDecoration = "underline";
                            newMsg.appendChild(document.createTextNode(`${person}: `));
                            newMsg.appendChild(fileLink);
                        }
                    } catch (err) {
                        console.warn("Failed to decrypt file:", err);
                        newMsg.textContent = "Could not decrypt a file (wrong password or corrupted data).";
                    }

                    chatMessages.appendChild(newMsg);
                    break;
                }

            default:
                {
                    console.warn("Unknown packet type:", packetType);
                    break;
                }
        }
    }

    ws.onopen = function () {
        statusTxt.textContent = "Status: Connected.";
    }

}, 100);

// # ---- HTML FUNCTIONS ---- #

sendBtn.addEventListener("click", () => {
    window.sendMessage(messageInput.value);
    messageInput.value = "";
});

messageInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        if (event.shiftKey) {
            let cursorPosition = messageInput.selectionStart;
            let currentValue = messageInput.value;
            messageInput.value = currentValue.substring(0, cursorPosition) + '\n' + currentValue.substring(cursorPosition);
            messageInput.selectionStart = messageInput.selectionEnd = cursorPosition + 1;
        } else {
            sendBtn.click();
        }
        event.preventDefault();
    }
});

sendFileBtn.addEventListener("click", function () {
    fileInput.click();
});

fileInput.addEventListener("change", function () {
    for (let file of fileInput.files) {
        sendFile(file);
    }
});

messageInput.addEventListener("paste", function (event) {
    let items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (let item of items) {
        if (item.kind === "file" && item.type.includes("image")) {
            let file = item.getAsFile();
            displayImageConfirmation(file);
        }
    }
});

setPasswordBtn.addEventListener("click", async () => {
    const password = passwordInput.value.trim();
    passwordKey = await deriveKey(password, salt);
    messageInput.disabled = false;
    sendBtn.disabled = false;
    sendFileBtn.disabled = false;
    passwordNotice.style.display = "none";
});

// # ---- HELPER FUNCTIONS ---- #

function displayImageConfirmation(file) {
    let reader = new FileReader();

    reader.onload = function (event) {
        document.getElementById("imagePreview").src = event.target.result;
        document.getElementById("imageConfirmationModal").style.display = "block";
    };

    reader.readAsDataURL(file);

    const confirmAction = function () {
        sendFile(file, true);
        hideConfirmationModal();
    };

    const cancelAction = function () {
        hideConfirmationModal();
    };

    const confirmPasteBtn = document.getElementById("confirmPasteBtn");
    const cancelPasteBtn = document.getElementById("cancelPasteBtn");

    confirmPasteBtn.addEventListener("click", confirmAction);
    cancelPasteBtn.addEventListener("click", cancelAction);

    function hideConfirmationModal() {
        document.getElementById("imageConfirmationModal").style.display = "none";
        confirmPasteBtn.removeEventListener("click", confirmAction);
        cancelPasteBtn.removeEventListener("click", cancelAction);
    }
}

async function sendFile(file, isImg = false) {
    if (file && passwordKey && ws.readyState === WebSocket.OPEN) {
        const fileBuffer = await file.arrayBuffer();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            passwordKey,
            fileBuffer
        );

        ws.send(
            new OAB.Writer()
                .string("file")
                .byte(isImg)
                .string(file.name)
                .bytes(ciphertext)
                .bytes(iv)
                .out()
        );
    }
}

function downloadFile(fileContent, fileName) {
    let element = document.createElement("a");
    element.setAttribute("href", fileContent);
    element.setAttribute("download", fileName);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function receiveMessage(msg) {
    let newMsg = document.createElement("p");
    newMsg.textContent = msg;
    chatMessages.append(newMsg);
}

async function deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function sendMessage(message) {
    if (passwordKey && ws.readyState === WebSocket.OPEN && message.trim() !== "") {
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            passwordKey,
            enc.encode(message)
        );

        ws.send(
            new OAB.Writer()
                .string("message")
                .bytes(ciphertext)
                .bytes(iv)
                .out()
        );
    }
}
