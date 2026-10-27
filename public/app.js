// ===== CONFIG =====
const NAMES = { me: '', partner: '' };
let socket = null;
let myName = '';
let currentRoom = '';

// ===== YouTube Player =====
let player = null;
let playerReady = false;
let isSyncing = false;
let isPlaying = false;
let progressInterval = null;

// ===== WebRTC =====
let localStream = null;
let peerConnection = null;
let isCalling = false;
let micEnabled = true;
let camEnabled = true;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.relay.metered.ca:80' }
  ]
};

let typingTimer = null;
let isTyping = false;

// ===== INIT =====
window.onload = () => {
  generateHearts();
  loadYouTubeAPI();
};

// ===== FLOATING HEARTS =====
function generateHearts() {
  const container = document.getElementById('heartsBg');
  const emojis = ['💕','🌸','✨','💗','🌺','💓'];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className = 'heart-float';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.animationDuration = (8 + Math.random() * 12) + 's';
    el.style.animationDelay = (Math.random() * 10) + 's';
    el.style.fontSize = (0.8 + Math.random() * 1.2) + 'rem';
    container.appendChild(el);
  }
}

// ===== ROOM MANAGEMENT =====
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function joinRoom() {
  const name = document.getElementById('inputName').value.trim();
  const room = document.getElementById('inputRoom').value.trim().toUpperCase();

  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }
  if (!room) { showToast('⚠️ Masukkan kode ruangan!'); return; }

  myName = name;
  currentRoom = room;
  initSocket();
}

function createRoom() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }

  myName = name;
  currentRoom = generateRoomId();
  document.getElementById('inputRoom').value = currentRoom;
  initSocket();
}

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join-room', { roomId: currentRoom, userName: myName });
    enterApp();
  });

  socket.on('room-state', (state) => {
    if (state.video && state.video.videoId) {
      loadYouTubeById(state.video.videoId, state.video.currentTime || 0, state.video.playing);
    }
  });

  socket.on('room-users', (users) => {
    updateOnlineCount(users.length + 1);
  });

  socket.on('user-joined', ({ userId, userName }) => {
    addSystemMessage(`💕 ${userName} bergabung!`);
    updateOnlineCount(getOnlineCount() + 1);
    // If we're already in a call, offer to the new user
    if (isCalling && peerConnection) {
      createOffer(userId);
    }
  });

  socket.on('user-left', ({ userName }) => {
    addSystemMessage(`👋 ${userName} keluar`);
    updateOnlineCount(Math.max(1, getOnlineCount() - 1));
    if (peerConnection) {
      endCall();
    }
  });

  // Chat
  socket.on('chat-message', (data) => {
    appendMessage(data, data.userId === socket.id);
  });

  socket.on('typing', ({ userName }) => {
    document.getElementById('typingIndicator').textContent = `${userName} sedang mengetik...`;
  });
  socket.on('stop-typing', () => {
    document.getElementById('typingIndicator').textContent = '';
  });

  // Video sync
  socket.on('video-play', ({ currentTime }) => {
    if (!player || !playerReady) return;
    isSyncing = true;
    player.seekTo(currentTime, true);
    player.playVideo();
    isPlaying = true;
    updatePlayPauseBtn();
    showSyncStatus('▶️ Diputar bersama');
    setTimeout(() => { isSyncing = false; }, 500);
  });

  socket.on('video-pause', ({ currentTime }) => {
    if (!player || !playerReady) return;
    isSyncing = true;
    player.seekTo(currentTime, true);
    player.pauseVideo();
    isPlaying = false;
    updatePlayPauseBtn();
    showSyncStatus('⏸️ Dijeda bersama');
    setTimeout(() => { isSyncing = false; }, 500);
  });

  socket.on('video-seek', ({ currentTime }) => {
    if (!player || !playerReady) return;
    player.seekTo(currentTime, true);
  });

  socket.on('video-change', ({ videoId }) => {
    loadYouTubeById(videoId, 0, false);
    showSyncStatus('🎬 Video baru dimuat!');
  });

  // Emoji
  socket.on('emoji-reaction', ({ emoji, userName }) => {
    floatEmoji(emoji);
    if (userName !== myName) {
      showToast(`${userName} bereaksi: ${emoji}`);
    }
  });

  // WebRTC
  socket.on('webrtc-offer', async ({ callerId, callerName, offer }) => {
    if (!localStream) {
      await startLocalStream();
    }
    if (!peerConnection) {
      createPeerConnection(callerId);
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', { targetId: callerId, answer });

    document.getElementById('remoteLabel').textContent = callerName;
    document.getElementById('remoteVideoWrapper').style.display = 'block';
    isCalling = true;
    updateCallBtn();
    addSystemMessage(`📹 Video call dimulai dengan ${callerName}`);
  });

  socket.on('webrtc-answer', async ({ answer }) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on('webrtc-ice', async ({ candidate }) => {
    if (peerConnection && candidate) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.error('ICE error:', e); }
    }
  });
}

function enterApp() {
  document.getElementById('screenLanding').classList.remove('active');
  document.getElementById('screenApp').style.display = 'flex';
  document.getElementById('screenApp').classList.add('active');
  document.getElementById('roomIdDisplay').textContent = currentRoom;
  document.getElementById('localLabel').textContent = myName;
  showToast(`💕 Selamat datang, ${myName}!`);

  // Show room code modal after 1 second
  setTimeout(() => {
    document.getElementById('modalRoomCode').textContent = currentRoom;
    document.getElementById('modalOverlay').classList.add('open');
  }, 1000);
}

function leaveRoom() {
  if (confirm('Keluar dari ruangan?')) {
    if (peerConnection) endCall();
    if (socket) socket.disconnect();
    location.reload();
  }
}

// ===== VIDEO CALL =====
async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = localStream;
    document.getElementById('localOverlay').style.display = 'none';
  } catch (e) {
    showToast('❌ Tidak bisa akses kamera/mic');
    console.error(e);
  }
}

function createPeerConnection(targetId) {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    remoteVideo.srcObject = event.streams[0];
    document.getElementById('remoteOverlay').style.display = 'none';
    document.getElementById('remoteVideoWrapper').style.display = 'block';
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice', { targetId, candidate: event.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
  };

  return peerConnection;
}

async function createOffer(targetId) {
  if (!peerConnection) {
    createPeerConnection(targetId);
  }
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('webrtc-offer', { targetId, offer });
}

async function toggleCall() {
  if (isCalling) {
    endCall();
  } else {
    await startLocalStream();
    if (!localStream) return;
    isCalling = true;
    updateCallBtn();

    // Find other users to call
    // We emit to room and let server relay
    // For now, just show local
    addSystemMessage('📹 Menunggu pasangan bergabung ke video call...');
    showToast('📹 Video call dimulai. Tunggu pasangan bergabung!');
  }
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  document.getElementById('localOverlay').style.display = 'flex';
  document.getElementById('remoteOverlay').style.display = 'flex';
  document.getElementById('remoteVideoWrapper').style.display = 'none';
  isCalling = false;
  updateCallBtn();
  addSystemMessage('📹 Video call berakhir');
}

function updateCallBtn() {
  const btn = document.getElementById('btnCall');
  const txt = document.getElementById('callBtnText');
  if (isCalling) {
    btn.classList.add('active');
    txt.textContent = '🔴 Akhiri VC';
  } else {
    btn.classList.remove('active');
    txt.textContent = '📹 Mulai VC';
  }
}

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  const btn = document.getElementById('btnMic');
  btn.textContent = micEnabled ? '🎤' : '🔇';
  btn.classList.toggle('muted', !micEnabled);
  showToast(micEnabled ? '🎤 Mic aktif' : '🔇 Mic mati');
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  const btn = document.getElementById('btnCam');
  btn.textContent = camEnabled ? '📷' : '📵';
  btn.classList.toggle('muted', !camEnabled);
  document.getElementById('localOverlay').style.display = camEnabled ? 'none' : 'flex';
  showToast(camEnabled ? '📷 Kamera aktif' : '📵 Kamera mati');
}

// ===== YOUTUBE API =====
function loadYouTubeAPI() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('youtubePlayer', {
    height: '100%',
    width: '100%',
    playerVars: {
      playsinline: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      origin: window.location.origin
    },
    events: {
      onReady: () => {
        playerReady = true;
        startProgressTracking();
      },
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (isSyncing || !socket) return;

  const time = player.getCurrentTime();

  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayPauseBtn();
    socket.emit('video-play', { roomId: currentRoom, currentTime: time });
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseBtn();
    socket.emit('video-pause', { roomId: currentRoom, currentTime: time });
  }
}

function toggleVideoInput() {
  const area = document.getElementById('videoInputArea');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

function loadVideo() {
  const url = document.getElementById('youtubeUrlInput').value.trim();
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    showToast('❌ Link YouTube tidak valid!');
    return;
  }
  loadYouTubeById(videoId, 0, false);
  if (socket) {
    socket.emit('video-change', { roomId: currentRoom, url, videoId });
  }
  document.getElementById('videoInputArea').style.display = 'none';
  document.getElementById('youtubeUrlInput').value = '';
  showSyncStatus('🎬 Video dimuat!');
}

function loadYouTubeById(videoId, startTime = 0, autoplay = false) {
  if (!player || !playerReady) {
    setTimeout(() => loadYouTubeById(videoId, startTime, autoplay), 500);
    return;
  }
  document.getElementById('noVideoPlaceholder').style.display = 'none';
  document.getElementById('syncControls').style.display = 'flex';
  player.loadVideoById({ videoId, startSeconds: startTime });
  if (!autoplay) {
    setTimeout(() => player.pauseVideo(), 500);
  }
}

function extractYouTubeId(url) {
  const patterns = [
    /youtu\.be\/([^?&#]+)/,
    /[?&]v=([^?&#]+)/,
    /youtube\.com\/embed\/([^?&#]+)/,
    /youtube\.com\/shorts\/([^?&#]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function togglePlayPause() {
  if (!player || !playerReady) return;
  if (isPlaying) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function updatePlayPauseBtn() {
  document.getElementById('playPauseIcon').textContent = isPlaying ? '⏸' : '▶';
}

function syncNow() {
  if (!player || !playerReady || !socket) return;
  const time = player.getCurrentTime();
  if (isPlaying) {
    socket.emit('video-play', { roomId: currentRoom, currentTime: time });
  } else {
    socket.emit('video-pause', { roomId: currentRoom, currentTime: time });
  }
  showSyncStatus('🔄 Disinkronkan!');
}

function startProgressTracking() {
  progressInterval = setInterval(() => {
    if (!player || !playerReady) return;
    try {
      const duration = player.getDuration();
      const current = player.getCurrentTime();
      if (duration > 0) {
        const pct = (current / duration) * 100;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('timeDisplay').textContent = formatTime(current);
      }
    } catch(e) {}
  }, 1000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function showSyncStatus(msg) {
  const el = document.getElementById('syncStatus');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// ===== CHAT =====
function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !socket) return;

  socket.emit('chat-message', { roomId: currentRoom, message, userName: myName });
  input.value = '';
  clearTyping();
}

function handleChatKey(event) {
  if (event.key === 'Enter') sendMessage();
}

function handleTyping() {
  if (!socket) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { roomId: currentRoom, userName: myName });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 1500);
}

function clearTyping() {
  if (isTyping && socket) {
    isTyping = false;
    socket.emit('stop-typing', { roomId: currentRoom });
  }
}

function appendMessage(data, isSelf) {
  const chatMessages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
  div.innerHTML = `
    ${!isSelf ? `<div class="msg-name">${data.userName}</div>` : ''}
    <div class="msg-bubble">${escapeHtml(data.message)}</div>
    <div class="msg-time">${data.timestamp}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-system-msg';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ===== EMOJI REACTIONS =====
function sendEmoji(emoji) {
  if (!socket) { showToast('⚠️ Belum masuk ke ruangan!'); return; }
  socket.emit('emoji-reaction', { roomId: currentRoom, emoji, userName: myName });
  floatEmoji(emoji);
}

function floatEmoji(emoji) {
  const container = document.getElementById('emojiFloatContainer');
  const el = document.createElement('div');
  el.className = 'emoji-float';
  el.textContent = emoji;
  el.style.left = (Math.random() * 60) + 'px';
  container.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ===== ONLINE COUNT =====
function getOnlineCount() {
  return parseInt(document.getElementById('onlineCount').textContent) || 1;
}
function updateOnlineCount(count) {
  document.getElementById('onlineCount').textContent = count;
}

// ===== ROOM CODE MODAL =====
function copyRoomId() {
  document.getElementById('modalRoomCode').textContent = currentRoom;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function copyAndClose() {
  navigator.clipboard.writeText(currentRoom).then(() => {
    showToast('📋 Kode disalin! Kirim ke pasangan kamu 💕');
  });
  closeModal();
}

// ===== TOAST =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
