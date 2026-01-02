class Reader {
    constructor(content) {
        this.at = 0;
        this.buffer = content;
        this.view = new DataView(content.buffer, content.byteOffset, content.byteLength);
    }
    byte() {
        if (this.at >= this.buffer.length)
            throw new Error("Out of bounds access!");
        return this.buffer[this.at++];
    }
    bytes() {
        const len = this.vu();
        if ((this.at + len) > this.buffer.length) throw new Error("Out of bounds access!");
        return this.buffer.slice(this.at, this.at += len);
    }
    vu() {
        let out = 0, shift = 0, b = 0;
        do {
            b = this.byte();
            out |= (b & 127) << shift;
            shift += 7;
        } while (b & 128);
        return out;
    }
    vi() {
        const data = this.vu();
        return data & 1 ? ~(data >> 1) : (data >> 1);
    }
    string() {
        const strLen = this.vu();
        if ((this.at + strLen) > this.buffer.length)
            throw new Error("Out of bounds access!");
        let final = "";
        for (let i = 0; i < strLen; i++) {
            const byte = this.buffer[this.at++];
            if (byte <= 0x7F) {
                final += String.fromCodePoint(byte);
            }
            else if ((byte & 0b11100000) === 0b11000000) {
                final += String.fromCodePoint(((byte & 0b00011111) << 6) | (this.buffer[this.at++] & 0b00111111));
            }
            else if ((byte & 0b11100000) === 0b11100000) {
                final += String.fromCodePoint(((byte & 0b00001111) << 12) | ((this.buffer[this.at++] & 0b00111111) << 6) |
                    (this.buffer[this.at++] & 0b00111111));
            }
            else if ((byte & 0b11110000) === 0b11110000) {
                final += String.fromCodePoint(((byte & 0b00000111) << 18) | ((this.buffer[this.at++] & 0b00111111) << 12) |
                    ((this.buffer[this.at++] & 0b00111111) << 6) | (this.buffer[this.at++] & 0b00111111));
            }
            else {
                throw new Error("Invalid UTF-8 sequence.");
            }
        }
        return final;
    }
    float() {
        if ((this.at + 8) > this.buffer.length)
            throw new Error("Out of bounds access!");
        const value = this.view.getFloat64(this.at, true);
        this.at += 8;
        return value;
    }
    reset(content = this.buffer) {
        this.at = 0;
        this.buffer = content;
        this.view = new DataView(content.buffer, content.byteOffset, content.byteLength);
        return this;
    }
}

class Writer {
    constructor() {
        this.buffer = [];
    }
    byte(num) {
        this.buffer.push(num);
        return this;
    }
    bytes(arr) {
        arr = new Uint8Array(arr);
        this.vu(arr.length);
        for (let i = 0; i < arr.length; i++)
            this.buffer.push(arr[i]);
        return this;
    }
    vu(num) {
        num >>>= 0;
        do {
            let part = num & 0b01111111;
            num >>>= 7;
            if (num)
                part |= 0b10000000;
            this.buffer.push(part);
        } while (num);
        return this;
    }
    vi(num) {
        return this.vu(num < 0 ? (~(num << 1)) : (num << 1));
    }
    string(str) {
        this.vu(str.length);
        for (let i = 0; i < str.length; i++) {
            const charCode = str.codePointAt(i);
            if (charCode <= 0x7F) {
                this.buffer.push(charCode);
            }
            else if (charCode <= 0x7FF) {
                this.buffer.push(0b11000000 | (charCode >> 6));
                this.buffer.push(0b10000000 | (charCode & 0b111111));
            }
            else if (charCode <= 0xFFFF) {
                this.buffer.push(0b11100000 | (charCode >> 12));
                this.buffer.push(0b10000000 | ((charCode >> 6) & 0b111111));
                this.buffer.push(0b10000000 | (charCode & 0b111111));
            }
            else if (charCode <= 0x10FFFF) {
                this.buffer.push(0b11110000 | (charCode >> 18));
                this.buffer.push(0b10000000 | ((charCode >> 12) & 0b111111));
                this.buffer.push(0b10000000 | ((charCode >> 6) & 0b111111));
                this.buffer.push(0b10000000 | (charCode & 0b111111));
            }
            else {
                throw new Error("Error in encoding in UTF-8: value out of bounds.");
            }
        }
        return this;
    }
    float(num) {
        const temp = new ArrayBuffer(8);
        new DataView(temp).setFloat64(0, num, true);
        this.buffer.push(...new Uint8Array(temp));
        return this;
    }
    out() {
        return new Uint8Array(this.buffer);
    }
    reset() {
        this.buffer = [];
        return this;
    }
}

(function (root, factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        // Node / CommonJS
        module.exports = factory();
    } else if (typeof define === "function" && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser global
        root.OAB = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    return { Reader, Writer };
}));
