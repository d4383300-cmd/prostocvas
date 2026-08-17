let ws;
let localStream = null;
let peerConnection = null;
let isCallActive = false;

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
  }, 2500);

  initWebSocket();
});

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'INIT_HISTORY':
      const chat = document.getElementById('chat-messages');
      chat.innerHTML = '';
      data.history.forEach(renderMessage);
      break;

    case 'CHAT_MESSAGE':
      renderMessage(data);
      break;

    case 'ERROR':
      alert(data.message);
      break;

    case 'AUTH_CODE':
      const display = document.getElementById('link-code-display');
      display.classList.remove('hidden');
      display.innerHTML = `Перейдите в бота и нажмите Start:<br><a href="https://t.me/xurestbot_bot?start=${data.code}" target="_blank">Перейти в бота</a>`;
      break;

    case 'AUTH_SUCCESS':
      alert('Аккаунт успешно привязан!');
      updateProfileData(data.user);
      break;

    case 'CASINO_RESULT':
      const resDiv = document.getElementById('casino-result');
      resDiv.innerHTML = `Выпало число: <strong>${data.roll}</strong>. ${data.win ? '🎉 Вы выиграли!' : '🪦 Вы проиграли.'}`;
      updateBalanceDisplays(data.newBalance);
      break;

    case 'CALL_STARTED':
      document.getElementById('call-overlay').classList.remove('hidden');
      break;

    case 'WEBRTC_OFFER':
      handleOffer(data.offer);
      break;

    case 'WEBRTC_ANSWER':
      peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;

    case 'WEBRTC_ICE':
      if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
      break;
  }
}

function renderMessage(msg) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg';

  let icon = '';
  if (msg.isTelegram) {
    icon = msg.isBot ? ' 🤖' : ' ✈️';
  }

  let badge = msg.badge ? ' ✔️' : '';
  let colorClass = msg.isTelegram ? 'tg-nickname' : `site-nickname nick-${msg.color || 'default'}`;

  let mediaHtml = '';
  if (msg.mediaType === 'photo') {
    mediaHtml = `<br><img src="${msg.mediaUrl}" style="max-width:100%; border-radius:8px; margin-top:5px;">`;
  } else if (msg.mediaType === 'voice') {
    mediaHtml = `<br><audio controls src="${msg.mediaUrl}"></audio>`;
  }

  msgDiv.innerHTML = `<span class="${colorClass}">${msg.sender}${icon}${badge}</span>: ${msg.text}${mediaHtml}`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  ws.send(JSON.stringify({ type: 'SEND_MESSAGE', text }));
  input.value = '';
}

function openTab(tabId) {
  document.querySelectorAll('.tab-content, #main-menu').forEach(el => el.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

function generateLinkCode() {
  ws.send(JSON.stringify({ type: 'GENERATE_AUTH_CODE' }));
}

function buyItem(item, cost) {
  ws.send(JSON.stringify({ type: 'BUY_ITEM', item, cost }));
}

function playCasino(mode) {
  const bet = parseInt(document.getElementById('casino-bet').value);
  if (!bet || bet <= 0) return alert('Введите корректную ставку');
  ws.send(JSON.stringify({ type: 'PLAY_CASINO', bet, mode }));
}

function updateProfileData(user) {
  document.getElementById('profile-nickname').innerText = user.username;
  updateBalanceDisplays(user.balance);
}

function updateBalanceDisplays(balance) {
  document.getElementById('profile-balance').innerText = balance;
  document.querySelectorAll('.user-balance-val').forEach(el => el.innerText = balance);
}

// WebRTC Звонки
async function toggleCall() {
  if (!isCallActive) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    document.getElementById('call-overlay').classList.remove('hidden');
    ws.send(JSON.stringify({ type: 'START_CALL' }));
    createPeerConnection();
    
    // Создаем offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'WEBRTC_OFFER', offer }));
    isCallActive = true;
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (e) => {
    const audio = document.createElement('audio');
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.getElementById('audio-container').appendChild(audio);
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: 'WEBRTC_ICE', candidate: e.candidate }));
    }
  };
}

async function handleOffer(offer) {
  if (!peerConnection) createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'WEBRTC_ANSWER', answer }));
}

function toggleMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('mic-btn').innerText = `🎤 Микрофон: ${audioTrack.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  }
}