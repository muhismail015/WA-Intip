const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const mime = require("mime-types");
const fs = require("fs");

const util = require("util");
const writeFileAsync = util.promisify(fs.writeFile);
const unlinkAsync = util.promisify(fs.unlink);

const osPlatform = require("os").platform();
console.log("Running on platform: ", osPlatform);

// FFmpeg
const ffmpeg = require("fluent-ffmpeg");
const ffprobe = require("@ffprobe-installer/ffprobe");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegs = require("ffmpeg-static");
ffmpeg.setFfprobePath(ffprobe.path);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Puppeter path
let execPath;
if (/^win/i.test(osPlatform)) {
  // Sesuaikan dengan lokasi Chrome terinstall di windows lu
  execPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
} else if (/^linux/i.test(osPlatform)) {
  // Sesuaikan path chromium-browser di linux, cek path dengan perintah "which chromium-browser"
  execPath = "/usr/bin/chromium-browser";
}

const client = new Client({
  authStrategy: new LocalAuth(),
  ffmpegPath: ffmpegs,
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
  console.log("\nClient is ready!\n");
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

      case ["aptuh"].includes(body) && message.hasQuotedMsg:
        await delay(timeer);
        const quotedMessageIntipSend = await message.getQuotedMessage();
        const targetNum = quotedMessageIntipSend.to;

        if (
          quotedMessageIntipSend &&
          quotedMessageIntipSend._data.isViewOnce === true
        ) {
          await intipMessageSend(quotedMessageIntipSend, targetNum);
        } else {
          console.log("Hanya berlaku untuk pesan 1x lihat");
        }
        break;

      default:
        break;
    }
  }
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
    console.log("[*] Copy Video Success");
  } else {
    await delay(timeer);
    message.reply(media, undefined, {
      caption: message.body ? `${message.body}` : null,
    });
    console.log("[*] Copy Img Success");
  }
}

async function intipMessageSend(message, targetNum) {
  const media = await message.downloadMedia();

  if (["video"].includes(message.type)) {
    await mediaToMp4(media.data, media.mimetype);

    const output = MessageMedia.fromFilePath("temp/output.mp4");

    await delay(timeer);
    await client.sendMessage(targetNum, output, {
      caption: message.body ? `${message.body}` : null,
    });
    fs.unlinkSync("temp/output.mp4");
    console.log("[*] Copy Video Success & send to: +" + targetNum);
  } else {
    await delay(timeer);
    await client.sendMessage(targetNum, media, {
      caption: message.body ? `${message.body}` : null,
    });

    console.log("[*] Copy Img Success & send to: +" + targetNum);
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
