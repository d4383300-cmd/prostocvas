const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('trust proxy', 1);

// 🛡️ Защита от DDoS
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    message: "Слишком много запросов."
});
app.use(limiter);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🤖 TELEGRAM BOT & ADMIN CONFIG
const TG_TOKEN = '8161722600:AAEef8zTPXRw7-fPgkHdkVX1pQqan7I5snY';
const ADMIN_TG_ID = 7505593850; // Твой ID Главного Админа

// Хранилище подключенных чатов и забаненных пользователей
const connectedChatIds = new Set(['-1004349256495']);
const bannedUsers = new Set();
const userState = {}; // Состояние ввода (ожидание ссылки или ID)

const tgBot = new TelegramBot(TG_TOKEN, { polling: true });
tgBot.on('polling_error', (error) => console.log('TG Notice:', error.code));

// 📝 БАЗА ДАННЫХ В ПАМЯТИ
const messageHistory = [];
const usersByIp = {};
const usedNicks = new Set();
let onlineCount = 0;
const userSpamTracker = {};

// 🔤 ГЕНЕРАТОР НИКНЕЙМОВ
const adj = ["Веселый", "Озорной", "Быстрый", "Хитрый", "Добрый", "Смелый", "Тихий", "Спящий", "Умный", "Сладкий", "Морской", "Лесной", "Крутой", "Пушистый", "Черный", "Белый", "Рыжий", "Золотой", "Солнечный", "Снежный", "Звездный", "Лунный", "Огненный", "Ледяной"];
const nouns = ["Зайчик", "Цыпленок", "Бабка", "Мамка", "ДядяФедор", "Матроскин", "Шарик", "Печкин", "Колобок", "Ежик", "Лис", "Совенок", "Волк", "Тигренок", "Медведь", "Кот", "Барсук", "Хомяк", "Пингвин", "Дракон", "Дед", "Внук", "Пончик", "Суслик"];

function generateUniqueNick() {
    let name = `${adj[Math.floor(Math.random() * adj.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
    if (!usedNicks.has(name)) {
        usedNicks.add(name);
        return name;
    }
    let counter = Math.floor(Math.random() * 9000) + 1000;
    while (usedNicks.has(`${name}${counter}`)) {
        counter++;
    }
    const finalNick = `${name}${counter}`;
    usedNicks.add(finalNick);
    return finalNick;
}

// 🤬 ЦЕНЗУРА МАТОВ
const BANNED_WORDS = ["блят", "хуй", "пизд", "ебат", "сука", "чмо", "гной"];
function filterBadWords(text) {
    let result = text;
    BANNED_WORDS.forEach(word => {
        const regex = new RegExp(word, 'gi');
        result = result.replace(regex, '####');
    });
    return result;
}

// 👑 МЕНЮ В TELEGRAM ДЛЯ ВСЕХ И ДЛЯ АДМИНА
function sendMainMenu(chatId, userId) {
    if (bannedUsers.has(userId)) return;

    if (userId === ADMIN_TG_ID) {
        const adminKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "➕ Добавить чат", callback_data: "admin_add_chat" }, { text: "➖ Удалить чат", callback_data: "admin_remove_chat" }],
                    [{ text: "📜 Список чатов", callback_data: "admin_list_chats" }]
                ]
            }
        };
        tgBot.sendMessage(chatId, "👑 **Панель Главного Администратора**\nВыберите действие:", { parse_mode: 'Markdown', ...adminKeyboard });
    } else {
        const userKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📩 Подать заявку на добавление бота", callback_data: "user_apply" }]
                ]
            }
        };
        tgBot.sendMessage(chatId, "👋 Добро пожаловать! Вы можете привязать аккаунт через профиль на сайте или подать заявку на добавление бота в ваш чат.", userKeyboard);
    }
}

// 📲 ОБРАБОТКА КОМАНДЫ /start И /admin
tgBot.onText(/\/start(.*)/, (msg, match) => {
    const userId = msg.from.id;
    if (bannedUsers.has(userId)) return;

    const payload = match[1] ? match[1].trim() : '';

    if (payload) {
        const clientIp = Buffer.from(payload, 'base64').toString('ascii');
        if (usersByIp[clientIp]) {
            usersByIp[clientIp].verified = true;
            usersByIp[clientIp].tgId = userId;

            if (userId === ADMIN_TG_ID) {
                usersByIp[clientIp].isAdmin = true;
                tgBot.sendMessage(msg.chat.id, "👑 Вы авторизованы как Администратор на сайте и в боте!");
            } else {
                tgBot.sendMessage(msg.chat.id, "✅ Ваш аккаунт успешно верифицирован! Вам выдана галочка ✔️ на сайте.");
            }

            if (usersByIp[clientIp].socketId) {
                io.to(usersByIp[clientIp].socketId).emit('user_updated', usersByIp[clientIp]);
                io.to(usersByIp[clientIp].socketId).emit('bot_message', { 
                    text: usersByIp[clientIp].isAdmin 
                        ? "👑 Вы авторизованы как Администратор!" 
                        : "🎉 Ваш аккаунт успешно верифицирован! Вам выдана галочка ✔️" 
                });
            }
        }
    }
    
    sendMainMenu(msg.chat.id, userId);
});

tgBot.onText(/\/admin/, (msg) => {
    if (msg.from.id === ADMIN_TG_ID) {
        sendMainMenu(msg.chat.id, msg.from.id);
    }
});

// 🔘 ОБРАБОТКА ИНЛАЙН-КНОПОК ТЕЛЕГРАМ
tgBot.on('callback_query', (query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    if (bannedUsers.has(userId)) {
        tgBot.answerCallbackQuery(query.id, { text: "Вы заблокированы.", show_alert: true });
        return;
    }

    // 👑 АДМИН-ДЕЙСТВИЯ
    if (userId === ADMIN_TG_ID) {
        if (data === 'admin_add_chat') {
            userState[userId] = 'awaiting_add_chat_id';
            tgBot.sendMessage(chatId, "Введите ID чата, который хотите добавить (например: `-100123456789`):", { parse_mode: 'Markdown' });
        } 
        else if (data === 'admin_remove_chat') {
            userState[userId] = 'awaiting_remove_chat_id';
            tgBot.sendMessage(chatId, "Введите ID чата, который хотите удалить из системы:", { parse_mode: 'Markdown' });
        } 
        else if (data === 'admin_list_chats') {
            const list = Array.from(connectedChatIds).join('\n') || "Список пуст";
            tgBot.sendMessage(chatId, `📜 **Подключенные чаты (${connectedChatIds.size}):**\n\`\`\`\n${list}\n\`\`\``, { parse_mode: 'Markdown' });
        }
        else if (data.startsWith('app_approve_')) {
            const targetUserId = data.replace('app_approve_', '');
            tgBot.sendMessage(targetUserId, "✅ **Ваша заявка принята!**\nПожалуйста, ожидайте сообщения или напишите администратору напрямую: @leymik", { parse_mode: 'Markdown' }).catch(() => {});
            tgBot.editMessageText(`${query.message.text}\n\nСтатус: ✅ **ПРИНЯТО**`, { chat_id: chatId, message_id: query.message.message_id });
        }
        else if (data.startsWith('app_reject_')) {
            const targetUserId = data.replace('app_reject_', '');
            tgBot.sendMessage(targetUserId, "❌ К сожалению, администратор отклонил вашу заявку на добавление чата.").catch(() => {});
            tgBot.editMessageText(`${query.message.text}\n\nСтатус: ❌ **ОТКЛОНЕНО**`, { chat_id: chatId, message_id: query.message.message_id });
        }
        else if (data.startsWith('app_ban_')) {
            const targetUserId = Number(data.replace('app_ban_', ''));
            bannedUsers.add(targetUserId);
            tgBot.sendMessage(targetUserId, "⛔ Вы были заблокированы администратором.").catch(() => {});
            tgBot.editMessageText(`${query.message.text}\n\nСтатус: ⛔ **ЗАБАНЕН**`, { chat_id: chatId, message_id: query.message.message_id });
        }
    }

    // 👤 ОБЫЧНЫЕ ПОЛЬЗОВАТЕЛИ
    if (data === 'user_apply') {
        userState[userId] = 'awaiting_channel_link';
        tgBot.sendMessage(chatId, "Отправьте ссылку на ваш Telegram канал/чат (например: `https://t.me/your_chat`):", { parse_mode: 'Markdown' });
    }

    tgBot.answerCallbackQuery(query.id);
});

// 📩 ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ В БОТЕ
tgBot.on('message', (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text;

    if (bannedUsers.has(userId) || !text || text.startsWith('/')) return;

    // Ввод ссылки обычным пользователем
    if (userState[userId] === 'awaiting_channel_link') {
        delete userState[userId];
        tgBot.sendMessage(chatId, "✅ Ваша заявка успешно отправлена! Ожидайте ответа администратора.");

        const userMention = msg.from.username ? `@${msg.from.username}` : `ID: ${userId}`;
        const adminApproveKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Принять", callback_data: `app_approve_${userId}` },
                        { text: "❌ Отклонить", callback_data: `app_reject_${userId}` },
                        { text: "⛔ Бан", callback_data: `app_ban_${userId}` }
                    ]
                ]
            }
        };

        tgBot.sendMessage(
            ADMIN_TG_ID, 
            `📩 **Новая заявка на добавление чата!**\n\n👤 **От кого:** ${userMention} (${userId})\n🔗 **Ссылка:** ${text}`, 
            { parse_mode: 'Markdown', ...adminApproveKeyboard }
        );
        return;
    }

    // Ввод ID для добавления чата админом
    if (userId === ADMIN_TG_ID && userState[userId] === 'awaiting_add_chat_id') {
        delete userState[userId];
        const cleanId = text.trim();
        connectedChatIds.add(cleanId);
        tgBot.sendMessage(chatId, `✅ Чат \`${cleanId}\` успешно добавлен в трансляцию!`, { parse_mode: 'Markdown' });
        return;
    }

    // Ввод ID для удаления чата админом
    if (userId === ADMIN_TG_ID && userState[userId] === 'awaiting_remove_chat_id') {
        delete userState[userId];
        const cleanId = text.trim();
        connectedChatIds.delete(cleanId);
        tgBot.sendMessage(chatId, `🗑️ Чат \`${cleanId}\` успешно удален из системы!`, { parse_mode: 'Markdown' });
        return;
    }

    // 📥 РЕЛЕ СООБЩЕНИЙ ИЗ TELEGRAM ЧАТОВ -> НА САЙТ И В ДРУГИЕ ЧАТЫ
    const sourceChatId = String(msg.chat.id);
    if (!connectedChatIds.has(sourceChatId)) return;

    const senderName = msg.from.first_name || msg.from.username || "TG_User";
    const censoredText = filterBadWords(text);

    const tgMsgData = {
        id: Date.now(),
        sender: senderName,
        prefix: 'TG',
        color: '#0078D7',
        text: censoredText,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isTelegram: true,
        verified: true
    };

    messageHistory.push(tgMsgData);
    if (messageHistory.length > 30) messageHistory.shift();
    io.emit('new_message', tgMsgData);

    const crossChatText = `${senderName} 🔷: ${censoredText}`;
    connectedChatIds.forEach(cId => {
        if (cId !== sourceChatId) {
            tgBot.sendMessage(cId, crossChatText).catch(() => {});
        }
    });
});

// 🌐 SOCKET.IO (САЙТ)
io.on('connection', (socket) => {
    onlineCount++;
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    if (!usersByIp[clientIp]) {
        usersByIp[clientIp] = {
            ip: clientIp,
            nick: generateUniqueNick(),
            regDate: new Date().toLocaleDateString('ru-RU'),
            prefix: '',
            color: '#000000',
            activeDays: 0,
            todayMessages: 0,
            lastActiveDay: new Date().toDateString(),
            rewardEligible: false,
            verified: false,
            isAdmin: false
        };
    }

    const user = usersByIp[clientIp];
    user.socketId = socket.id;

    const encodedIp = Buffer.from(clientIp).toString('base64');
    const botUsername = "xurestbot_bot";
    user.tgLink = `https://t.me/${botUsername}?start=${encodedIp}`;

    socket.emit('init_user', user);
    socket.emit('load_history', messageHistory.slice(-30));
    io.emit('online_update', onlineCount);

    socket.on('admin_add_chat', (newChatId) => {
        if (!user.isAdmin) return;
        if (!newChatId || typeof newChatId !== 'string') return;
        
        const cleanChatId = newChatId.trim();
        connectedChatIds.add(cleanChatId);

        socket.emit('bot_message', { 
            text: `✅ **Чат ${cleanChatId} успешно добавлен!**` 
        });
    });

    socket.on('send_message', (text) => {
        if (!text || typeof text !== 'string') return;
        text = text.trim();
        if (text.length === 0 || text.length > 200) return;

        const now = Date.now();
        if (!userSpamTracker[clientIp]) userSpamTracker[clientIp] = [];
        userSpamTracker[clientIp] = userSpamTracker[clientIp].filter(t => now - t < 4000);

        if (userSpamTracker[clientIp].length >= 3) {
            socket.emit('bot_message', { 
                text: `⚠️ **${user.nick}**, это спам! Разрешено не более 3 сообщений за 4 секунды.`,
                showRulesBtn: true 
            });
            return;
        }
        userSpamTracker[clientIp].push(now);

        if (text.toLowerCase() === 'стата') {
            socket.emit('bot_message', { text: `📊 Сейчас на сайте пользователей: ${onlineCount}` });
            return;
        }
        if (text.toLowerCase() === 'правила') {
            socket.emit('bot_message', { 
                text: `📜 **Правила:**\n1. Призыв в ЛС запрещен!\n2. Ссылки запрещены!\n3. Спам запрещен!`,
                showRulesBtn: true
            });
            return;
        }
        if (text.toLowerCase() === 'сменить ник') {
            usedNicks.delete(user.nick);
            user.nick = generateUniqueNick();
            socket.emit('user_updated', user);
            socket.emit('bot_message', { text: `✅ Ваш новый никнейм: **${user.nick}**` });
            return;
        }

        const cleanText = filterBadWords(text);

        const today = new Date().toDateString();
        if (user.lastActiveDay !== today) {
            if (user.todayMessages >= 50) user.activeDays++;
            else user.activeDays = 0;
            user.todayMessages = 0;
            user.lastActiveDay = today;
        }
        user.todayMessages++;
        if (user.activeDays >= 3 && !user.rewardEligible) {
            user.rewardEligible = true;
            socket.emit('bot_message', { text: `🎉 Вы проявили активность 3 дня! Вам доступна награда в Магазине!` });
        }

        const msgData = {
            id: Date.now(),
            sender: user.nick,
            prefix: user.prefix,
            color: user.color,
            text: cleanText,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            isBot: false,
            verified: user.verified
        };

        messageHistory.push(msgData);
        if (messageHistory.length > 30) messageHistory.shift();

        const badge = user.verified ? ' ✔️' : '';
        const tgFormatText = `${user.prefix ? '[' + user.prefix + '] ' : ''}${user.nick}${badge}: ${cleanText}`;
        
        connectedChatIds.forEach(chatId => {
            tgBot.sendMessage(chatId, tgFormatText).catch(() => {});
        });

        io.emit('new_message', msgData);
    });

    socket.on('update_customization', ({ prefix, color }) => {
        if (!user.rewardEligible) return;
        if (prefix && prefix.length <= 8) user.prefix = prefix.trim();
        if (color) user.color = color;
        socket.emit('user_updated', user);
    });

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        io.emit('online_update', onlineCount);
    });
});

setInterval(() => {
    const botMsg = {
        id: Date.now(),
        sender: "Харест",
        isBot: true,
        text: 'Хочешь бесплатную мишку в Telegram? Заходи на канал <a href="https://t.me/xurestv" target="_blank" class="chat-link">@xurestv</a>',
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
    messageHistory.push(botMsg);
    if (messageHistory.length > 30) messageHistory.shift();
    io.emit('new_message', botMsg);
}, 90000);

app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
