const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const mime = require("mime-types");
const fs = require("fs");

const path = require("path");
const util = require("util");
const writeFileAsync = util.promisify(fs.writeFile);
const unlinkAsync = util.promisify(fs.unlink);

setupLogging()

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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-extensions",
      '--disable-gpu', 
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      '--disable-dev-shm-usage'
  ],
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
    const targetNum = message._data.id.fromMe;

    if (targetNum === true) {
      messageQueue.push(message);

      if (!isProcessingQueue) {
        processMessageQueue();
      }
    } else {
    }
  } catch (error) {
    console.error("Error:", error);
  }
});

client.initialize();

async function processMessageQueue() {
  try {
    isProcessingQueue = true;
  
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      const body = message.body.toLowerCase();
  
      switch (true) {
        case [".intip"].includes(body) && message.type === "chat":
          await delay(timeer);

          if (message.hasQuotedMsg) {
            const quotedMessageIntip = await message.getQuotedMessage();
            
            if (
              quotedMessageIntip &&
              quotedMessageIntip._data.isViewOnce === true
            ) {
              await intipMessage(quotedMessageIntip);
            } else {
              console.log("Hanya berlaku untuk pesan 1x lihat");
            }
          }
  
          break;
  
        case ["aptuh"].includes(body) && message.type === "chat":
          await delay(timeer);

          if (message.hasQuotedMsg) {
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
  } catch (error) {
    console.error("Error: ", error)
  }
}

async function intipMessage(message) {
  try {
    const media = await message.downloadMedia();
    const timestamp = Date.now();
  
    if (["video"].includes(message.type)) {
      await mediaToMp4(media.data, media.mimetype);
  
      const output = MessageMedia.fromFilePath("temp/output.mp4");
  
      await delay(timeer);
      await message.reply(output, undefined, {
        caption: message.body ? `${message.body}` : null,
      });

      // Save to local
      fs.writeFileSync(`save-media/vid/${timestamp}.mp4`, output.data, { encoding: 'base64' });

      console.log("Copy & Save Video Success");

      // Delete temp file
      fs.unlinkSync("temp/output.mp4");

    } else {
      await delay(timeer);
      await message.reply(media, undefined, {
        caption: message.body ? `${message.body}` : null,
      });

      // Save to local
      fs.writeFileSync(`save-media/img/${timestamp}.jpg`, media.data, { encoding: 'base64' });

      console.log("Copy & Save Img Success");

    }
  } catch (error) {
    console.error("Error: ", error)
  }
}

async function intipMessageSend(message, targetNum) {
  try {
    const media = await message.downloadMedia();
    const timestamp = Date.now();
  
    if (["video"].includes(message.type)) {
      await mediaToMp4(media.data, media.mimetype);
  
      const output = MessageMedia.fromFilePath("temp/output.mp4");
      
      // Save to local
      fs.writeFileSync(`save-media/vid/${timestamp}.mp4`, output.data, { encoding: 'base64' });
  
      await delay(timeer);
      await client.sendMessage(targetNum, output, {
        caption: message.body ? `${message.body}` : null,
      });

      console.log("Save Video Success & Send to: +" + targetNum);

      // Delete temp file
      fs.unlinkSync("temp/output.mp4");
    } else {
      // Save to local
      fs.writeFileSync(`save-media/img/${timestamp}.jpg`, media.data, { encoding: 'base64' });

      await delay(timeer);
      await client.sendMessage(targetNum, media, {
        caption: message.body ? `${message.body}` : null,
      });
  
      console.log("Save Img Success & Send to: +" + targetNum);
    }
  } catch (error) {
    console.error("Error: ".error)
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

function setupLogging() {
  function getCurrentTimestamp() {
    // Date Format
    const currDate = new Date();
    const date = currDate.toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = currDate.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return date + "-" + time;
  }

  const logFilePath = path.join(__dirname, "app.log");
  const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  process.stdout.write = function (chunk, encoding, callback) {
    logStream.write(chunk);
    originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
  };

  process.stderr.write = function (chunk, encoding, callback) {
    logStream.write(chunk);
    originalStderrWrite.call(process.stderr, chunk, encoding, callback);
  };

  // Mengalihkan console.log dan console.error
  console.log = function () {
    const timestamp = getCurrentTimestamp();
    const logMessage = `[#] [${timestamp}] ${util.format.apply(null, arguments)}\n`;
    logStream.write(logMessage);
    originalStdoutWrite.call(process.stdout, logMessage);
  };

  console.error = function () {
    const timestamp = getCurrentTimestamp();
    const logMessage = `[!] [${timestamp}] ${util.format.apply(null, arguments)}\n`;
    logStream.write(logMessage);
    originalStderrWrite.call(process.stderr, logMessage);
  };

  // Menangani kesalahan yang mungkin terjadi saat menulis ke file log
  logStream.on("error", (err) => {
    console.error("Gagal menulis ke file log:", err);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
