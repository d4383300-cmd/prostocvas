const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer');
const fs = require('fs');

// Конфигурация параметров пользователя
const BOT_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const TARGET_GROUPS = ['-1004486534339', '-1004349256495'];
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000'; // Адрес развернутого сайта

const bot = new Telegraf(BOT_TOKEN);

let browser;
let page;

async function initBrowser() {
  browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle']
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(SITE_URL, { waitUntil: 'networkidle2' });
}

// Ракурсы Камер Скрытного Наблюдения (Скрипты вызова внутри Three.js контейнера)
const cameraAngles = [
  { name: "Вид с Проектора", script: "camera.position.set(0, 8, 11); camera.lookAt(0, 0, -10);" },
  { name: "Боковая Камера (Левая)", script: "camera.position.set(-12, 6, 0); camera.lookAt(0, 2, 0);" },
  { name: "Вид от Экранной Зоны", script: "camera.position.set(0, 2, -10); camera.lookAt(0, 2, 10);" }
];

async function captureAndSendSnapshots() {
  if (!page) return;

  for (const angle of cameraAngles) {
    try {
      // Меняем ракурс камеры прямо в работающем сценарии Three.js
      await page.evaluate((cmd) => { eval(cmd); }, angle.script);
      await new Promise(r => setTimeout(r, 1000)); // Задержка рендера

      const screenshotPath = `./snap_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });

      // Отправка во все указанные чаты
      for (const chatId of TARGET_GROUPS) {
        await bot.telegram.sendPhoto(chatId, { source: screenshotPath }, {
          caption: `🎥 <b>Скрытая камера</b>\n📍 Ракурс: ${angle.name}`,
          parse_mode: 'HTML'
        });
      }

      fs.unlinkSync(screenshotPath); // Очистка временного файла
    } catch (err) {
      console.error(`Ошибка захвата ракурса (${angle.name}):`, err);
    }
  }
}

// Запуск бота и таймер отправки раз в 5 минут
bot.launch().then(() => {
  console.log("Telegram Bot Успешно Запущен.");
  initBrowser().then(() => {
    setInterval(captureAndSendSnapshots, 300000); // 300 000 мс = 5 минут
  });
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
