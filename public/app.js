// ===== RAFFY & VELIN TOGETHER (STABLE RELAY & WEBRTC ENGINE) =====
let myName = '';
let currentRoom = '';
let isHost = false;

// Realtime Relay (PieSocket Free Global Cluster - No Server Needed)
let wsRelay = null;
const RELAY_API_KEY = 'v4D5wA22M7Y9Z'; // Public client channel

// WebRTC Direct Peer Connection
let peerConnection = null;
let localStream = null;
let isCalling = false;
let micEnabled = true;
let camEnabled = true;

// YouTube Player
let player = null;
let playerReady = false;
let isSyncing = false;
let isPlaying = false;
let progressInterval = null;
let currentVideoId = 'jfKfPfyJRdk';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

// ===== INIT =====
window.onload = () => {
  generateHearts();
  loadYouTubeAPI();

  // Read URL Hash if partner clicks shared link (e.g. #ABC123)
  const hashRoom = window.location.hash.replace('#', '').trim().toUpperCase();
  if (hashRoom) {
    document.getElementById('inputRoom').value = hashRoom;
    showToast('🔑 Kode ruangan terisi otomatis dari link!');
  }
};

// ===== FLOATING HEARTS BACKGROUND =====
function generateHearts() {
  const container = document.getElementById('heartsBg');
  if (!container) return;
  const emojis = ['💕', '🌸', '✨', '💗', '🌺', '💓', '🧸'];
  for (let i = 0; i < 14; i++) {
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
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createRoom() {
  const name = document.getElementById('inputName').value.trim();
  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }

  myName = name;
  currentRoom = generateRoomId();
  document.getElementById('inputRoom').value = currentRoom;
  isHost = true;
  connectToRoom();
}

function joinRoom() {
  const name = document.getElementById('inputName').value.trim();
  const room = document.getElementById('inputRoom').value.trim().toUpperCase();

  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }
  if (!room) { showToast('⚠️ Masukkan kode ruangan!'); return; }

  myName = name;
  currentRoom = room;
  isHost = false;
  connectToRoom();
}

// ===== REALTIME RELAY CHANNEL =====
function connectToRoom() {
  showToast('🔄 Menghubungkan ke ruangan...');
  window.location.hash = currentRoom;

  // PieSocket free public websocket endpoint for instant 24/7 sync
  const channelUrl = `wss://free.blr2.piesocket.com/v3/${currentRoom.toLowerCase()}?api_key=${RELAY_API_KEY}&notify_self=0`;

  try {
    wsRelay = new WebSocket(channelUrl);

    wsRelay.onopen = () => {
      enterApp();
      updateOnlineCount(2);

      // Announce presence
      sendSignal({ type: 'user-joined', userName: myName, isHost });
      addSystemMessage(`💕 Kamu bergabung ke ruangan ${currentRoom}`);

      // Auto start local camera if permitted so user is ready
      startLocalStream(true);
    };

    wsRelay.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSignalMessage(data);
      } catch (e) {
        console.error('Signal parse error:', e);
      }
    };

    wsRelay.onclose = () => {
      console.log('Relay closed, auto reconnecting...');
      setTimeout(() => {
        if (currentRoom) connectToRoom();
      }, 2000);
    };

    wsRelay.onerror = (err) => {
      console.error('Relay error:', err);
    };

  } catch (err) {
    console.error('WS Error:', err);
    enterApp();
  }
}

function sendSignal(msg) {
  if (wsRelay && wsRelay.readyState === WebSocket.OPEN) {
    wsRelay.send(JSON.stringify(msg));
  }
}

// ===== SIGNAL HANDLING (WEBRTC & APP SYNC) =====
async function handleSignalMessage(data) {
  switch (data.type) {
    case 'user-joined':
      addSystemMessage(`💕 ${data.userName} sudah terhubung di ruangan!`);
      showToast(`💕 ${data.userName} online!`);
      updateOnlineCount(2);

      // If host, send current video state
      if (isHost && player && playerReady) {
        sendSignal({
          type: 'room-state',
          video: {
            videoId: currentVideoId,
            currentTime: player.getCurrentTime ? player.getCurrentTime() : 0,
            playing: isPlaying
          }
        });
      }

      // If already calling, create WebRTC offer
      if (isCalling && localStream) {
        initiateWebRtcCall();
      }
      break;

    case 'room-state':
      if (data.video && data.video.videoId) {
        loadYouTubeById(data.video.videoId, data.video.currentTime || 0, data.video.playing);
      }
      break;

    case 'chat':
      appendMessage(data, false);
      break;

    case 'typing':
      document.getElementById('typingIndicator').textContent = `${data.userName} sedang mengetik...`;
      break;

    case 'stop-typing':
      document.getElementById('typingIndicator').textContent = '';
      break;

    case 'emoji':
      floatEmoji(data.emoji);
      if (data.userName !== myName) {
        showToast(`${data.userName}: ${data.emoji}`);
      }
      break;

    case 'video-play':
      if (player && playerReady) {
        isSyncing = true;
        player.seekTo(data.currentTime, true);
        player.playVideo();
        isPlaying = true;
        updatePlayPauseBtn();
        showSyncStatus('▶️ Diputar bersama');
        setTimeout(() => { isSyncing = false; }, 600);
      }
      break;

    case 'video-pause':
      if (player && playerReady) {
        isSyncing = true;
        player.seekTo(data.currentTime, true);
        player.pauseVideo();
        isPlaying = false;
        updatePlayPauseBtn();
        showSyncStatus('⏸️ Dijeda bersama');
        setTimeout(() => { isSyncing = false; }, 600);
      }
      break;

    case 'video-seek':
      if (player && playerReady) {
        player.seekTo(data.currentTime, true);
      }
      break;

    case 'video-change':
      loadYouTubeById(data.videoId, 0, true);
      showSyncStatus('🎬 Video baru dimuat!');
      break;

    // WebRTC Signaling
    case 'webrtc-offer':
      await handleWebRtcOffer(data.offer, data.userName);
      break;

    case 'webrtc-answer':
      await handleWebRtcAnswer(data.answer);
      break;

    case 'webrtc-ice':
      if (peerConnection && data.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('ICE add error:', e);
        }
      }
      break;

    case 'call-ended':
      handleRemoteCallEnded();
      break;
  }
}

// ===== WEBRTC VIDEO CALL LOGIC =====
function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  // Add local camera/mic tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Receive remote partner stream
  peerConnection.ontrack = (event) => {
    console.log('Received partner video track!');
    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) {
      remoteVid.srcObject = event.streams[0];
    }
    const remoteOverlay = document.getElementById('remoteOverlay');
    if (remoteOverlay) remoteOverlay.style.display = 'none';

    syncCinemaStreams();
    isCalling = true;
    updateCallBtn();
    addSystemMessage('📹 Wajah pasangan sudah tampil di layar!');
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({ type: 'webrtc-ice', candidate: event.candidate });
    }
  };

  return peerConnection;
}

async function startLocalStream(silent = false) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: true
    });

    const localVid = document.getElementById('localVideo');
    if (localVid) localVid.srcObject = localStream;
    const localOverlay = document.getElementById('localOverlay');
    if (localOverlay) localOverlay.style.display = 'none';

    syncCinemaStreams();
    if (!silent) showToast('📷 Kamera & Mic kamu aktif!');
    return true;
  } catch (err) {
    console.warn('Media devices error:', err);
    if (!silent) {
      showToast('⚠️ Izinkan akses Kamera & Mic di browser HP ya!');
    }
    return false;
  }
}

async function toggleCall() {
  if (isCalling) {
    endCall();
    sendSignal({ type: 'call-ended' });
  } else {
    const started = await startLocalStream(false);
    if (!started) return;

    isCalling = true;
    updateCallBtn();
    initiateWebRtcCall();
    addSystemMessage('📹 Memulai panggilan video ke pasangan...');
  }
}

async function initiateWebRtcCall() {
  const pc = createPeerConnection();
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'webrtc-offer', offer, userName: myName });
  } catch (err) {
    console.error('Create offer error:', err);
  }
}

async function handleWebRtcOffer(offer, callerName) {
  if (!localStream) {
    await startLocalStream(true);
  }

  const pc = createPeerConnection();
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: 'webrtc-answer', answer });

    isCalling = true;
    updateCallBtn();
    showToast(`📹 Terhubung dengan ${callerName}!`);
  } catch (err) {
    console.error('Handle offer error:', err);
  }
}

async function handleWebRtcAnswer(answer) {
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Handle answer error:', err);
    }
  }
}

function handleRemoteCallEnded() {
  const remoteVid = document.getElementById('remoteVideo');
  if (remoteVid) remoteVid.srcObject = null;
  const overlay = document.getElementById('remoteOverlay');
  if (overlay) overlay.style.display = 'flex';
  const overlayText = document.getElementById('remoteOverlayText');
  if (overlayText) overlayText.textContent = 'Menunggu Pasangan...';

  syncCinemaStreams();
  addSystemMessage('📹 Pasangan mematikan video call');
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  const localVid = document.getElementById('localVideo');
  if (localVid) localVid.srcObject = null;
  const localOverlay = document.getElementById('localOverlay');
  if (localOverlay) localOverlay.style.display = 'flex';

  handleRemoteCallEnded();
  isCalling = false;
  updateCallBtn();
  addSystemMessage('📹 Video call dimatikan');
}

function updateCallBtn() {
  const btn = document.getElementById('btnCall');
  if (!btn) return;
  if (isCalling) {
    btn.classList.add('active');
    btn.innerHTML = '<span>Tutup VC</span><span class="btn-icon">📵</span>';
  } else {
    btn.classList.remove('active');
    btn.innerHTML = '<span>Mulai VC</span><span class="btn-icon">📹</span>';
  }
}

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
  document.getElementById('btnMic').textContent = micEnabled ? '🎤' : '🔇';
  showToast(micEnabled ? '🎤 Mic Nyala' : '🔇 Mic Mati');
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
  document.getElementById('btnCam').textContent = camEnabled ? '📷' : '🚫';
  showToast(camEnabled ? '📷 Kamera Nyala' : '🚫 Kamera Mati');
}

// ===== CINEMA FULLSCREEN LANDSCAPE =====
function toggleFullscreenCinema() {
  const isCinema = document.body.classList.toggle('cinema-fullscreen');
  const btn = document.getElementById('btnFullscreen');

  syncCinemaStreams();

  if (isCinema) {
    if (btn) btn.innerHTML = '✖ Keluar Fullscreen';

    const cl = document.getElementById('cinemaLocalLabel');
    const cr = document.getElementById('cinemaRemoteLabel');
    if (cl) cl.textContent = myName ? `${myName} 💖` : 'Kamu 💖';
    if (cr) cr.textContent = 'Pasangan 💕';

    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }

    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }

    showToast('🎬 Mode Bioskop Landscape Aktif!');
  } else {
    if (btn) btn.innerHTML = '⛶ Fullscreen';

    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }

    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  }
}

function syncCinemaStreams() {
  const cinemaLocal = document.getElementById('cinemaLocalVideo');
  const cinemaRemote = document.getElementById('cinemaRemoteVideo');
  const localVid = document.getElementById('localVideo');
  const remoteVid = document.getElementById('remoteVideo');

  if (cinemaLocal && localVid && localVid.srcObject) {
    cinemaLocal.srcObject = localVid.srcObject;
  }
  if (cinemaRemote && remoteVid && remoteVid.srcObject) {
    cinemaRemote.srcObject = remoteVid.srcObject;
  }
}

// ===== YOUTUBE SYNC LOGIC =====
function loadYouTubeAPI() {
  if (window.YT) return;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('ytPlayer', {
    videoId: currentVideoId,
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerReady() {
  playerReady = true;
  updatePlayPauseBtn();
  startProgressTracker();
}

function onPlayerStateChange(event) {
  if (isSyncing) return;

  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime();
    sendSignal({ type: 'video-play', currentTime });
    showSyncStatus('▶️ Memutar video...');
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime();
    sendSignal({ type: 'video-pause', currentTime });
    showSyncStatus('⏸️ Menjeda video...');
  }
}

function togglePlay() {
  if (!player || !playerReady) return;
  if (isPlaying) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

function updatePlayPauseBtn() {
  const btn = document.getElementById('btnPlayPause');
  if (btn) btn.textContent = isPlaying ? '⏸️' : '▶️';
}

function seekTo(event) {
  if (!player || !playerReady) return;
  const bar = document.getElementById('progressBar');
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const newTime = ratio * player.getDuration();
  player.seekTo(newTime, true);
  sendSignal({ type: 'video-seek', currentTime: newTime });
}

function startProgressTracker() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!player || !playerReady || !isPlaying) return;
    const current = player.getCurrentTime();
    const duration = player.getDuration();
    if (duration > 0) {
      const pct = (current / duration) * 100;
      document.getElementById('progressFill').style.width = pct + '%';
      document.getElementById('timeDisplay').textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
  }, 500);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function toggleVideoInput() {
  const el = document.getElementById('videoInputArea');
  if (el) {
    el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none';
  }
}

function loadVideo() {
  const input = document.getElementById('inputVideoUrl');
  const url = input.value.trim();
  if (!url) { showToast('⚠️ Masukkan link YouTube!'); return; }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    showToast('❌ Link YouTube tidak valid!');
    return;
  }

  currentVideoId = videoId;
  loadYouTubeById(videoId, 0, true);
  sendSignal({ type: 'video-change', videoId });
  input.value = '';
}

function loadYouTubeById(id, startTime = 0, autoPlay = false) {
  currentVideoId = id;
  if (player && playerReady) {
    isSyncing = true;
    player.loadVideoById({
      videoId: id,
      startSeconds: startTime
    });
    if (!autoPlay) player.pauseVideo();
    setTimeout(() => { isSyncing = false; }, 800);
  }
}

function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function showSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2500);
}

// ===== UI & NAVIGATION =====
function enterApp() {
  const landing = document.getElementById('screenLanding');
  if (landing) {
    landing.classList.remove('active');
    landing.classList.add('hidden');
    landing.style.display = 'none';
  }
  const screenApp = document.getElementById('screenApp');
  if (screenApp) {
    screenApp.style.display = 'flex';
    screenApp.classList.add('active');
  }

  document.getElementById('roomIdDisplay').textContent = currentRoom;
  document.getElementById('localLabel').textContent = `${myName} 💖`;
  showToast(`💕 Ruangan aktif: ${currentRoom}`);

  // Show room code modal after 1 second if host
  if (isHost) {
    setTimeout(() => {
      document.getElementById('modalRoomCode').textContent = currentRoom;
      document.getElementById('modalOverlay').classList.add('open');
    }, 800);
  }
}

function leaveRoom() {
  if (confirm('Keluar dari ruangan?')) {
    endCall();
    if (wsRelay) wsRelay.close();
    window.location.hash = '';
    location.reload();
  }
}

// ===== CHAT =====
let typingTimer = null;
let isTyping = false;

function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const msgData = {
    type: 'chat',
    userName: myName,
    message,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  };

  appendMessage(msgData, true);
  sendSignal(msgData);
  input.value = '';
  clearTyping();
}

function handleChatKey(event) {
  if (event.key === 'Enter') sendMessage();
}

function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    sendSignal({ type: 'typing', userName: myName });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 1500);
}

function clearTyping() {
  if (isTyping) {
    isTyping = false;
    sendSignal({ type: 'stop-typing' });
  }
}

function appendMessage(data, isSelf) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
  div.innerHTML = `
    ${!isSelf ? `<div class="msg-name">${escapeHtml(data.userName)}</div>` : ''}
    <div class="msg-bubble">${escapeHtml(data.message)}</div>
    <div class="msg-time">${data.timestamp}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = 'chat-system-msg';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ===== EMOJI REACTIONS =====
function sendEmoji(emoji) {
  floatEmoji(emoji);
  sendSignal({ type: 'emoji', emoji, userName: myName });
}

function floatEmoji(emoji) {
  const container = document.getElementById('emojiFloatContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'emoji-float';
  el.textContent = emoji;
  el.style.left = (Math.random() * 60) + 'px';
  container.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function updateOnlineCount(count) {
  const el = document.getElementById('onlineCount');
  if (el) el.textContent = count;
}

function copyRoomId() {
  document.getElementById('modalRoomCode').textContent = currentRoom;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function copyAndClose() {
  const shareUrl = `${window.location.origin}${window.location.pathname}#${currentRoom}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('📋 Link ruangan disalin! Tinggal kirim ke Velin 💕');
  }).catch(() => {
    navigator.clipboard.writeText(currentRoom);
    showToast('📋 Kode disalin: ' + currentRoom);
  });
  closeModal();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
