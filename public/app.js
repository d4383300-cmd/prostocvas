let ws;
let localStream = null;
let peerConnection = null;
let inCall = false;
let mySiteId = null;
let myUsername = '';

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('splash-screen').classList.add('hidden');
  }, 2200);

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
    case 'INIT_DATA':
      mySiteId = data.siteId;
      myUsername = data.username;
      document.getElementById('profile-nick').innerText = myUsername;
      document.getElementById('profile-site-id').innerText = mySiteId;
      updateCallCount(data.callCount);

      const chat = document.getElementById('chat-messages');
      chat.innerHTML = '';
      data.history.forEach(renderMessage);
      break;

    case 'CHAT_MESSAGE':
      renderMessage(data);
      break;

    case 'SYSTEM_NOTIFY':
      renderSystemNotify(data.text);
      break;

    case 'ERROR':
    case 'MUTE_ERROR':
      alert(data.message);
      break;

    case 'CALL_COUNT_UPDATE':
      updateCallCount(data.count);
      break;

    case 'AUTH_CODE':
      const box = document.getElementById('auth-link-box');
      box.classList.remove('hidden');
      box.innerHTML = `<p style="margin-top:10px;">Перейдите в бота:</p><a href="https://t.me/xurestbot_bot?start=${data.code}" target="_blank" style="color:#ffd700;">Открыть Бот</a>`;
      break;

    case 'AUTH_SUCCESS':
      alert('Успешно привязано к Telegram!');
      updateUserData(data.user);
      break;

    case 'CASINO_RESULT':
      document.getElementById('casino-result').innerHTML = `Выпало: <strong>${data.roll}</strong>. ${data.win ? '🎉 Выиграли!' : '🪦 Проигрыш.'}`;
      updateBalance(data.newBalance);
      break;

    case 'BUY_SUCCESS':
      alert('Покупка совершена успешно!');
      updateUserData(data.user);
      break;

    case 'WEBRTC_OFFER':
      handleOffer(data.offer);
      break;

    case 'WEBRTC_ANSWER':
      if (peerConnection) peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;

    case 'WEBRTC_ICE':
      if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      break;
  }
}

function updateUserData(user) {
  updateBalance(user.balance);
  if (user.is_admin === 1) {
    document.getElementById('profile-admin-status').innerText = '👑 Администратор';
  }
}

function renderMessage(msg) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg';

  let icon = msg.isTelegram ? (msg.isBot ? ' 🤖' : ' ✈️') : '';
  let badge = msg.badge ? ' ✔️' : '';
  let colorClass = msg.isTelegram ? 'tg-nickname' : `site-nickname nick-${msg.color || 'default'}`;

  let mediaHtml = '';
  if (msg.mediaType === 'photo') {
    mediaHtml = `<br><img src="${msg.mediaUrl}" style="max-width:100%; border-radius:6px; margin-top:5px;">`;
  } else if (msg.mediaType === 'voice') {
    mediaHtml = `<br><audio controls src="${msg.mediaUrl}" style="max-width:100%; margin-top:5px;"></audio>`;
  }

  div.innerHTML = `<span class="${colorClass}" onclick="showUserModal('${msg.sender}', '${msg.siteId}')">${msg.sender}${icon}${badge}</span>: ${msg.text}${mediaHtml}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderSystemNotify(text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg';
  div.style.background = 'rgba(255, 215, 0, 0.2)';
  div.style.borderColor = '#ffd700';
  div.innerText = text;
  container.appendChild(div);
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
  document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

function showUserModal(name, id) {
  document.getElementById('modal-user-name').innerText = name;
  document.getElementById('modal-user-id').innerText = id;
  document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
}

function generateAuthLink() {
  ws.send(JSON.stringify({ type: 'GENERATE_AUTH_CODE' }));
}

function buyItem(item, cost) {
  ws.send(JSON.stringify({ type: 'BUY_ITEM', item, cost }));
}

function playCasino(mode) {
  const bet = parseInt(document.getElementById('casino-bet').value);
  if (!bet || bet <= 0) return alert('Введите ставку');
  ws.send(JSON.stringify({ type: 'PLAY_CASINO', bet, mode }));
}

function updateBalance(val) {
  document.getElementById('profile-balance').innerText = val;
  document.querySelectorAll('.user-balance-val').forEach(el => el.innerText = val);
}

function updateCallCount(count) {
  document.getElementById('call-user-count').innerText = count;
  document.getElementById('call-count-val').innerText = count;
}

// --- Хуютуб Видеоплеер ---
function loadVideo() {
  const url = document.getElementById('video-url-input').value.trim();
  const container = document.getElementById('video-embed-container');
  let embedUrl = '';

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      embedUrl = `https://www.youtube.com/embed/${match[2]}?autoplay=1`;
    }
  } else if (url.includes('rutube.ru')) {
    const parts = url.split('/video/');
    if (parts[1]) {
      const id = parts[1].split('/')[0];
      embedUrl = `https://rutube.ru/play/embed/${id}`;
    }
  } else if (url.includes('vk.com') || url.includes('vkvideo.ru')) {
    embedUrl = url;
  }

  if (embedUrl) {
    container.classList.remove('hidden');
    container.innerHTML = `<iframe src="${embedUrl}" width="100%" height="250" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen style="border-radius:6px;"></iframe>`;
  } else {
    alert('Введите правильную ссылку на YouTube, Rutube или VK Video!');
  }
}

// WebRTC Звонки
async function toggleCall() {
  if (!inCall) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      inCall = true;
      document.getElementById('call-bar').classList.remove('hidden');
      ws.send(JSON.stringify({ type: 'JOIN_CALL' }));
      createPeerConnection();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: 'WEBRTC_OFFER', offer }));
    } catch (e) {
      alert('Микрофон недоступен!');
    }
  }
}

function leaveCall() {
  if (inCall) {
    inCall = false;
    document.getElementById('call-bar').classList.add('hidden');
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    ws.send(JSON.stringify({ type: 'LEAVE_CALL' }));
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);
  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (e) => {
    const audio = document.createElement('audio');
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.getElementById('audio-streams').appendChild(audio);
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) ws.send(JSON.stringify({ type: 'WEBRTC_ICE', candidate: e.candidate }));
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
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    document.getElementById('mic-btn').innerText = `🎤 Мик: ${track.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  }
}
