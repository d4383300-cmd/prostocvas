const http = require('http');
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer-core');

// ==========================================
// 1. HTTP-СЕРВЕР ДЛЯ РАЗДАЧИ 3D-САЙТА (RENDER)
// ==========================================
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');

  if (!fs.existsSync(filePath)) {
    console.error(`[ОШИБКА] Файл index.html не найден: ${filePath}`);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Файл index.html не найден.');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error("[ОШИБКА] Не удалось прочитать index.html:", err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ошибка чтения файла.');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP Сервер успешно запущен на порту ${PORT}`);
});


// ==========================================
// 2. НАСТРОЙКИ TELEGRAM БОТА И ПУППЕТИРА
// ==========================================
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_GROUPS = ['-1004486534339', '-1004349256495'];
const SITE_URL = `http://localhost:${PORT}`;

const bot = new Telegraf(BOT_TOKEN);
let browser;
let page;
let isBotActive = false; // Флаг работы бота

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
    console.log("📸 Виртуальная камера подключена к 3D-сцене.");
  } catch (err) {
    console.error("❌ Ошибка запуска Puppeteer:", err.message);
  }
}

// Ракурсы скрытой камеры
const cameraAngles = [
  { name: "Вид с Проектора", script: "if(typeof camera !== 'undefined') { camera.position.set(0, 8, 11); camera.lookAt(0, 0, -10); }" },
  { name: "Боковая Камера (Левая)", script: "if(typeof camera !== 'undefined') { camera.position.set(-12, 6, 0); camera.lookAt(0, 2, 0); }" },
  { name: "Вид от Экранной Зоны", script: "if(typeof camera !== 'undefined') { camera.position.set(0, 2, -10); camera.lookAt(0, 2, 10); }" }
];

async function captureAndSendSnapshots() {
  if (!page || !isBotActive) return;

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

      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
    } catch (err) {
      console.error(`❌ Ошибка съемки (${angle.name}):`, err.message);
    }
  }
}

bot.command('photo', async (ctx) => {
  if (!isBotActive) return;
  await ctx.reply('📸 Делаю снимок скрытой камерой...');
  await captureAndSendSnapshots();
});


// ==========================================
// 3. БЕЗОПАСНЫЙ ЗАПУСК С ПЕРЕХВАТОМ СЕССИИ
// ==========================================
async function startServer() {
  // Запускаем 3D-браузер
  await initBrowser();

  try {
    // 1. Принудительно сбрасываем старые вебхуки и зависшие запросы сторонних процессов
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    
    // 2. Пробуем запустить бота
    await bot.launch({ dropPendingUpdates: true });
    isBotActive = true;
    console.log("🤖 Telegram Bot Успешно Перехватил Управление и Запущен!");

    // Запускаем авто-скриншоты каждые 5 минут
    setInterval(captureAndSendSnapshots, 300000);

  } catch (err) {
    isBotActive = false;
    console.warn("⚠️ НЕ УДАЛОСЬ ПОДКЛЮЧИТЬ БОТА (Конфликт сессий / 409 Conflict).");
    console.warn("⚠️ Сервер продолжает работу В РЕЖИМЕ БЕЗ БОТА. Сайт полностью доступен!");
  }
}

startServer();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
