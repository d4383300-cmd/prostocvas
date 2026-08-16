function renderMessage(msg) {
    const box = document.getElementById('chat-box');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.isBot ? 'bot' : ''}`;
    
    const prefixStr = msg.prefix ? `<span style="color:${msg.color}">[${msg.prefix}]</span> ` : '';
    const nameStr = `<b style="color:${msg.color}">${msg.sender}</b>`;
    
    // Бейджи для Бота и Telegram
    let badge = '';
    if (msg.isBot) {
        badge = `<span class="bot-badge">BOT</span>`;
    } else if (msg.isTelegram) {
        badge = `<span class="tg-badge">Telegram</span>`;
    }

    div.innerHTML = `<small style="color:#666">[${msg.time}]</small> ${badge}${prefixStr}${nameStr}: ${msg.text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}
