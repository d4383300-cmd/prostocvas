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
  // Определяем абсолютный путь к index.html
  const filePath = path.join(__dirname, 'index.html');

  // Проверяем наличие файла
  if (!fs.existsSync(filePath)) {
    console.error(`[ОШИБКА] Файл index.html не найден по пути: ${filePath}`);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Файл index.html не найден в корне проекта.');
  }

  // Отдаем index.html пользователям
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error("[ОШИБКА] Не удалось прочитать index.html:", err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ошибка чтения файла на сервере.');
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

// Локальный URL для виртуального оператора
const SITE_URL = `http://localhost:${PORT}`;

const bot = new Telegraf(BOT_TOKEN);
let browser;
let page;

// Инициализация браузера без скачивания лишних бинарников
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

// Функция создания и отправки скриншотов
async function captureAndSendSnapshots() {
  if (!page) return;

  for (const angle of cameraAngles) {
    try {
      // Меняем ракурс внутри 3D-сцены
      await page.evaluate((cmd) => { eval(cmd); }, angle.script);
      await new Promise(r => setTimeout(r, 1000)); // Пауза для рендера кадра

      const screenshotPath = `./snap_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });

      // Отправка во все указанные группы
      for (const chatId of TARGET_GROUPS) {
        await bot.telegram.sendPhoto(chatId, { source: screenshotPath }, {
          caption: `🎥 <b>Скрытная камера</b>\n📍 Ракурс: ${angle.name}`,
          parse_mode: 'HTML'
        });
      }

      // Удаление временного файла
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
    } catch (err) {
      console.error(`❌ Ошибка съемки (${angle.name}):`, err.message);
    }
  }
}


// ==========================================
// 3. КОМАНДЫ БОТА И ТАЙМЕРЫ
// ==========================================

// Ручной вызов снимка по команде /photo в Telegram
bot.command('photo', async (ctx) => {
  await ctx.reply('📸 Делаю снимок скрытой камерой...');
  await captureAndSendSnapshots();
});

// Запуск Telegram-бота и авто-съемки
bot.launch().then(() => {
  console.log("🤖 Telegram Bot Успешно Запущен.");
  initBrowser().then(() => {
    // Авто-скриншоты каждые 5 минут (300 000 мс)
    setInterval(captureAndSendSnapshots, 300000);
  });
});

// Обработка мягкого выключения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
