const sendBtn = document.getElementById("sendBtn");
const statusTxt = document.getElementById("statusTxt");
const statusDot = document.querySelector(".status-dot");
const messageInput = document.getElementById("messageInput");
const chatMessages = document.getElementById("chatMessages");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");
const modal = document.getElementById("imageConfirmationModal");

const notifySound = new Audio("./notification.mp3");

const enc = new TextEncoder();
const dec = new TextDecoder();

let ws;

// # ---- STATUS HELPERS ---- #

function setStatus(text, state) {
    statusTxt.textContent = text;
    statusDot.className = "status-dot";
    if (state) statusDot.classList.add(state);
}

// # ---- MAIN LOOP ---- #

setTimeout(async function connect() {
    ws = new WebSocket(window.location.protocol.replace("http", "ws") + "//" + location.host);
    ws.binaryType = "arraybuffer";
    setStatus("Connecting...", "");

    ws.onclose = function (closeEvent) {
        setStatus("Disconnected", "disconnected");
        console.log(closeEvent);
        setTimeout(connect, 5000);
    }

    ws.onerror = function () {
        setStatus("Error", "disconnected");
    }

    ws.onmessage = async function (message) {
        const data = new Uint8Array(message.data);
        const reader = new OAB.Reader(data);
        const packetType = reader.string();

        switch (packetType) {
            case "connected":
                {
                    addSystemMessage("Someone joined the chat");
                    break;
                }

            case "disconnected":
                {
                    addSystemMessage("Someone left the chat");
                    break;
                }

            case "users":
                {
                    addSystemMessage(`${reader.vu()} user(s) connected`);
                    break;
                }

            case "message":
                {
                    const isYou = reader.byte();
                    const messageText = reader.string();

                    addChatMessage(messageText, isYou);
                    break;
                }

            case "file":
                {
                    const isYou = reader.byte();
                    const isImg = reader.byte();
                    const fileName = reader.string();
                    const fileData = reader.bytes();

                    addFileMessage(isYou, isImg, fileName, fileData);
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
        setStatus("Connected", "connected");
    }
}, 100);

// # ---- HTML FUNCTIONS ---- #

sendBtn.addEventListener("click", () => {
    window.sendMessage(messageInput.value);
    messageInput.value = "";
    messageInput.style.height = "auto";
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

messageInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
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

// # ---- MESSAGE RENDERING ---- #

function addSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "message system";
    el.textContent = text;
    recv(el, false);
}

function addChatMessage(text, isYou) {
    const el = document.createElement("div");
    el.className = "message " + (isYou ? "you" : "other");
    el.textContent = text;
    recv(el, isYou);
}

function addFileMessage(isYou, isImg, fileName, fileData) {
    const el = document.createElement("div");
    el.className = "message " + (isYou ? "you" : "other");

    if (isImg) {
        const blob = new Blob([fileData]);
        const url = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.src = url;
        el.appendChild(img);
    } else {
        const blob = new Blob([fileData]);
        const url = URL.createObjectURL(blob);
        const fileLink = document.createElement("a");
        fileLink.href = url;
        fileLink.download = fileName;
        fileLink.textContent = fileName;
        el.appendChild(fileLink);
    }

    recv(el, isYou);
}

// # ---- HELPER FUNCTIONS ---- #

function displayImageConfirmation(file) {
    let reader = new FileReader();

    reader.onload = function (event) {
        document.getElementById("imagePreview").src = event.target.result;
        modal.classList.add("visible");
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
        modal.classList.remove("visible");
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
