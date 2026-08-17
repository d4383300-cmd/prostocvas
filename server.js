const http = require('http');
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer-core');

// 1. НАСТРОЙКА HTTP-СЕРВЕРА ДЛЯ RENDER
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // Отдаем index.html при заходе на сайт
  let filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading index.html');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP Сервер запущен на порту ${PORT}`);
});

// 2. НАСТРОЙКА TELEGRAM БОТА И ПУППЕТИРА
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_GROUPS = ['-1004486534339', '-1004349256495'];

// Внутренний URL локального сервера для снятия скриншотов
const SITE_URL = `http://localhost:${PORT}`;

const bot = new Telegraf(BOT_TOKEN);
let browser;
let page;

async function initBrowser() {
  const executablePath = process.env.PUPPETEER_EXEC_PATH 
    || '/usr/bin/google-chrome' 
    || '/usr/bin/chromium-browser' 
    || '/usr/bin/chromium';

  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(SITE_URL, { waitUntil: 'networkidle2' });
    console.log("Puppeteer успешно загрузил 3D-сцену.");
  } catch (err) {
    console.error("Ошибка запуска Puppeteer:", err);
  }
}

// Ракурсы Камер
const cameraAngles = [
  { name: "Вид с Проектора", script: "if(typeof camera !== 'undefined') { camera.position.set(0, 8, 11); camera.lookAt(0, 0, -10); }" },
  { name: "Боковая Камера (Левая)", script: "if(typeof camera !== 'undefined') { camera.position.set(-12, 6, 0); camera.lookAt(0, 2, 0); }" },
  { name: "Вид от Экранной Зоны", script: "if(typeof camera !== 'undefined') { camera.position.set(0, 2, -10); camera.lookAt(0, 2, 10); }" }
];

async function captureAndSendSnapshots() {
  if (!page) return;

  for (const angle of cameraAngles) {
    try {
      await page.evaluate((cmd) => { eval(cmd); }, angle.script);
      await new Promise(r => setTimeout(r, 1000));

      const screenshotPath = `./snap_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });

      for (const chatId of TARGET_GROUPS) {
        await bot.telegram.sendPhoto(chatId, { source: screenshotPath }, {
          caption: `🎥 <b>Скрытная камера</b>\n📍 Ракурс: ${angle.name}`,
          parse_mode: 'HTML'
        });
      }

      fs.unlinkSync(screenshotPath);
    } catch (err) {
      console.error(`Ошибка снимка (${angle.name}):`, err);
    }
  }
}

// Ручной вызов по /photo
bot.command('photo', async (ctx) => {
  await ctx.reply('📸 Делаю снимок скрытой камерой...');
  await captureAndSendSnapshots();
});

// Запуск бота
bot.launch().then(() => {
  console.log("Telegram Bot Успешно Запущен.");
  initBrowser().then(() => {
    // Авто-скриншоты каждые 5 минут
    setInterval(captureAndSendSnapshots, 300000);
  });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
