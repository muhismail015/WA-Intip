const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const ffmpeg = require("fluent-ffmpeg");
const mime = require("mime-types");
const fs = require("fs");

const util = require("util");
const writeFileAsync = util.promisify(fs.writeFile);
const unlinkAsync = util.promisify(fs.unlink);

const osPlatform = require("os").platform();
console.log("Running on platform: ", osPlatform);

// Puppeter path
let execPath;
if (/^win/i.test(osPlatform)) {
  execPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
} else if (/^linux/i.test(osPlatform)) {
  execPath = "/usr/bin/chromium-browser";
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: execPath,
  },
});

const messageQueue = [];
let isProcessingQueue = false;
const timeer = 1000;

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("loading_screen", (percent, message) => {
  console.log("Loading:", percent, message);
});

client.on("ready", async () => {
  console.log("Client is ready!");
});

client.on("message_create", async (message) => {
  try {
    const body = message.body.toLowerCase();

    messageQueue.push(message);

    if (!isProcessingQueue) {
      processMessageQueue();
    }
  } catch (error) {
    console.error("Error:", error);
  }
});

client.initialize();

async function processMessageQueue() {
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    const body = message.body.toLowerCase();

    switch (true) {
      case [".intip"].includes(body) && message.hasQuotedMsg:
        await delay(timeer);
        const quotedMessageIntip = await message.getQuotedMessage();

        if (
          quotedMessageIntip &&
          quotedMessageIntip._data.isViewOnce === true
        ) {
          await intipMessage(quotedMessageIntip);
        } else {
          console.log("Hanya berlaku untuk pesan 1x lihat");
        }
        break;

      default:
        break;
    }
  }
  // Proses pesan berikutnya dalam antrian setelah semua pesan selesai diproses
  if (messageQueue.length > 0) {
    await processMessageQueue();
  }
  isProcessingQueue = false;
}

async function intipMessage(message) {
  const media = await message.downloadMedia();

  if (["video"].includes(message.type)) {
    await mediaToMp4(media.data, media.mimetype);

    const output = MessageMedia.fromFilePath("temp/output.mp4");

    await delay(timeer);
    await message.reply(output, undefined, {
      caption: message.body ? `${message.body}` : null,
    });
    fs.unlinkSync("temp/output.mp4");
  } else {
    await delay(timeer);
    message.reply(media, undefined, {
      caption: message.body ? `${message.body}` : null,
    });
  }
}

// Utils
async function mediaToMp4(base64, mimeType) {
  try {
    const buffer = Buffer.from(base64, "base64");
    const extension = mime.extension(mimeType) || "unknown";
    const inputFileName = "temp/" + `input.${extension}`;
    const outputFileName = "temp/" + `output.mp4`;

    await writeFileAsync(inputFileName, buffer);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputFileName)
        .outputOptions([
          "-pix_fmt yuv420p",
          "-c:v libx264",
          "-movflags +faststart",
          "-filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2'",
        ])
        .output(outputFileName)
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          console.error("Error:", err);
          reject(err);
        })
        .run();
    });

    await unlinkAsync(inputFileName);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
