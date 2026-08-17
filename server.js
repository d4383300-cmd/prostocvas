const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_GROUPS = ['-1004486534339', '-1004349256495'];
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

const bot = new Telegraf(BOT_TOKEN);

let browser;
let page;

async function initBrowser() {
  // Находим системный путь к Chrome/Chromium на сервере
  const executablePath = process.env.PUPPETEER_EXEC_PATH 
    || '/usr/bin/google-chrome' 
    || '/usr/bin/chromium-browser' 
    || '/usr/bin/chromium';

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
}

// Ракурсы Камер Скрытного Наблюдения
const cameraAngles = [
  { name: "Вид с Проектора", script: "camera.position.set(0, 8, 11); camera.lookAt(0, 0, -10);" },
  { name: "Боковая Камера (Левая)", script: "camera.position.set(-12, 6, 0); camera.lookAt(0, 2, 0);" },
  { name: "Вид от Экранной Зоны", script: "camera.position.set(0, 2, -10); camera.lookAt(0, 2, 10);" }
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
      console.error(`Ошибка выполнения снимка (${angle.name}):`, err);
    }
  }
}

// Команда ручного вызова снимка в Telegram: /photo
bot.command('photo', async (ctx) => {
  await ctx.reply('📸 Делаю снимок скрытой камерой...');
  await captureAndSendSnapshots();
});

// Запуск бота
bot.launch().then(() => {
  console.log("Telegram Bot Успешно Запущен.");
  initBrowser().then(() => {
    // Делать авто-скриншот каждые 5 минут (300000 мс)
    setInterval(captureAndSendSnapshots, 300000);
  });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
