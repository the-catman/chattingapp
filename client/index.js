const sendBtn = document.getElementById("sendBtn");
const statusTxt = document.getElementById("statusTxt");
const messageInput = document.getElementById("messageInput");
const chatMessages = document.getElementById("chatMessages");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");

const notifySound = new Audio("./notification.mp3");

const enc = new TextEncoder();
const dec = new TextDecoder();

let ws;

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
            case "connected":
                {
                    receiveMessage("Unknown has joined the chat.");
                    break;
                }

            case "disconnected":
                {
                    receiveMessage("Unknown has left the chat.");
                    break;
                }

            case "users":
                {
                    receiveMessage(`Number of connected users: ${reader.vu()}`);
                    break;
                }

            case "message":
                {
                    const isYou = reader.byte();
                    const person = isYou ? "You" : "Unknown";
                    const messageText = reader.string();

                    receiveMessage(`${person}: ${messageText}`, isYou);
                    break;
                }

            case "file":
                {
                    const isYou = reader.byte();
                    const person = isYou ? "You" : "Unknown";
                    const isImg = reader.byte();
                    const fileName = reader.string();
                    const fileData = reader.bytes();

                    let newMsg = document.createElement("p");

                    if (isImg) {
                        const blob = new Blob([fileData]);
                        const url = URL.createObjectURL(blob);
                        const img = document.createElement("img");
                        img.src = url;
                        img.style.maxWidth = "100%";
                        img.style.height = "auto";
                        newMsg.appendChild(document.createTextNode(`${person}: `));
                        newMsg.appendChild(img);
                    } else {
                        const blob = new Blob([fileData]);
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

                    recv(newMsg, isYou);
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
    if (file && ws.readyState === WebSocket.OPEN) {
        const fileBuffer = await file.arrayBuffer();

        ws.send(
            new OAB.Writer()
                .string("file")
                .byte(isImg)
                .string(file.name)
                .bytes(fileBuffer)
                .out()
        );
    }
}

function receiveMessage(msg, isYou = false) {
    let newMsg = document.createElement("p");
    newMsg.textContent = msg;
    recv(newMsg, isYou);
}

function recv(element, isYou = false) {
    const shouldScroll = isNearBottom();
    chatMessages.append(element);
    if (shouldScroll) scrollToBottom();
    if (!document.hasFocus() && !isYou) {
        const sound = notifySound.cloneNode();
        sound.play().catch(console.warn);
    }
}

async function sendMessage(message) {
    if (ws.readyState === WebSocket.OPEN && message.trim() !== "") {
        ws.send(
            new OAB.Writer()
                .string("message")
                .string(message)
                .out()
        );
    }
}

function isNearBottom(threshold = 50) {
    return (
        chatMessages.scrollHeight -
        chatMessages.scrollTop -
        chatMessages.clientHeight
    ) < threshold;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
