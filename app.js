// ===== CONFIG & STATE =====
let myName = '';
let currentRoom = '';
let isHost = false;

// PeerJS Instances
let myPeer = null;
let hostConn = null;              // For guest: connection to host
let guestConns = new Map();       // For host: connections to guests (peerId -> DataConnection)
let mediaCalls = new Map();       // peerId -> MediaConnection

// YouTube Player
let player = null;
let playerReady = false;
let isSyncing = false;
let isPlaying = false;
let progressInterval = null;

// Media & WebRTC
let localStream = null;
let isCalling = false;
let micEnabled = true;
let camEnabled = true;

let typingTimer = null;
let isTyping = false;

// ===== INIT =====
window.onload = () => {
  generateHearts();
  loadYouTubeAPI();

  // Auto-fill room from URL hash if available (e.g. #ROOM123)
  const hashRoom = window.location.hash.replace('#', '').trim().toUpperCase();
  if (hashRoom) {
    document.getElementById('inputRoom').value = hashRoom;
  }
};

// ===== FLOATING HEARTS =====
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
  initPeerNetwork();
}

function joinRoom() {
  const name = document.getElementById('inputName').value.trim();
  const room = document.getElementById('inputRoom').value.trim().toUpperCase();

  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }
  if (!room) { showToast('⚠️ Masukkan kode ruangan!'); return; }

  myName = name;
  currentRoom = room;
  isHost = false;
  initPeerNetwork();
}

// ===== P2P REALTIME NETWORK (PeerJS) =====
function getHostPeerId(roomId) {
  return `rv-together-${roomId.toLowerCase()}-host`;
}

function getGuestPeerId(roomId) {
  return `rv-together-${roomId.toLowerCase()}-${Math.random().toString(36).substring(2, 8)}`;
}

function initPeerNetwork() {
  showToast('🔄 Menghubungkan ke jaringan...');
  const peerId = isHost ? getHostPeerId(currentRoom) : getGuestPeerId(currentRoom);

  const peerConfig = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.relay.metered.ca:80' }
      ]
    }
  };

  try {
    myPeer = new Peer(peerId, peerConfig);
  } catch (err) {
    console.error('Peer init error:', err);
    showToast('❌ Gagal inisialisasi jaringan P2P');
    return;
  }

  myPeer.on('open', (id) => {
    console.log('My peer ID is:', id);
    enterApp();

    if (isHost) {
      updateOnlineCount(1);
      addSystemMessage(`👑 Kamu membuat ruangan: ${currentRoom}`);
    } else {
      connectToHost();
    }
  });

  // Handle incoming data connections (Mainly for host)
  myPeer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  // Handle incoming media call (Video Call)
  myPeer.on('call', async (call) => {
    console.log('Incoming call from:', call.peer);
    if (!localStream) {
      await startLocalStream();
    }

    call.answer(localStream);
    handleMediaCallStream(call);
  });

  myPeer.on('error', (err) => {
    console.error('Peer error:', err);
    if (err.type === 'unavailable-id') {
      if (isHost) {
        showToast('⚠️ Ruangan ini sudah aktif! Mencoba bergabung sebagai tamu...');
        isHost = false;
        myPeer.destroy();
        initPeerNetwork();
      }
    } else if (err.type === 'peer-unavailable') {
      showToast('❌ Ruangan tidak ditemukan atau pasangan belum online!');
    } else {
      showToast('⚠️ Koneksi: ' + (err.message || 'Error'));
    }
  });
}

// Guest connects to Host
function connectToHost() {
  const hostId = getHostPeerId(currentRoom);
  const conn = myPeer.connect(hostId, {
    metadata: { userName: myName }
  });

  conn.on('open', () => {
    hostConn = conn;
    setupDataConnection(conn);
    // Send join announcement
    sendData({ type: 'join', userName: myName });
    addSystemMessage(`💕 Terhubung dengan ruangan ${currentRoom}!`);
  });

  conn.on('error', (e) => {
    console.error('Conn to host error:', e);
    showToast('❌ Gagal menghubungi pasangan di ruangan');
  });
}

// Setup data channel listeners
function setupDataConnection(conn) {
  conn.on('open', () => {
    if (isHost) {
      guestConns.set(conn.peer, conn);
      updateOnlineCount(guestConns.size + 1);

      // Send current state to newly joined guest
      if (player && playerReady) {
        const state = {
          type: 'room-state',
          video: {
            videoId: currentVideoId,
            currentTime: player.getCurrentTime ? player.getCurrentTime() : 0,
            playing: isPlaying
          }
        };
        conn.send(state);
      }
    }
  });

  conn.on('data', (data) => {
    handleIncomingData(data, conn);
  });

  conn.on('close', () => {
    if (isHost) {
      guestConns.delete(conn.peer);
      updateOnlineCount(guestConns.size + 1);
    }
    addSystemMessage('👋 Pasangan meninggalkan ruangan');
    removeRemoteVideo();
  });
}

// Broadcast or send data
function sendData(msg) {
  if (isHost) {
    // Send to all guests
    guestConns.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  } else {
    // Send to host
    if (hostConn && hostConn.open) {
      hostConn.send(msg);
    }
  }
}

// Handle data protocol
function handleIncomingData(data, senderConn) {
  // If host, forward to other guests (broadcast relay)
  if (isHost) {
    guestConns.forEach((conn) => {
      if (conn.peer !== senderConn.peer && conn.open) {
        conn.send(data);
      }
    });
  }

  switch (data.type) {
    case 'join':
      addSystemMessage(`💕 ${data.userName} bergabung!`);
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
        showToast(`${data.userName} bereaksi: ${data.emoji}`);
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
        setTimeout(() => { isSyncing = false; }, 500);
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
        setTimeout(() => { isSyncing = false; }, 500);
      }
      break;

    case 'video-seek':
      if (player && playerReady) {
        player.seekTo(data.currentTime, true);
      }
      break;

    case 'video-change':
      loadYouTubeById(data.videoId, 0, false);
      showSyncStatus('🎬 Video baru dimuat!');
      break;
  }
}

// ===== UI & NAVIGATION =====
function toggleVideoInput() {
  const el = document.getElementById('videoInputArea');
  if (el) {
    el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none';
  }
}

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
  document.getElementById('localLabel').textContent = myName;
  showToast(`💕 Selamat datang, ${myName}!`);

  // Share room link hash
  window.location.hash = currentRoom;

  // Show room code modal after 1 second
  setTimeout(() => {
    document.getElementById('modalRoomCode').textContent = currentRoom;
    document.getElementById('modalOverlay').classList.add('open');
  }, 1000);
}

function leaveRoom() {
  if (confirm('Keluar dari ruangan?')) {
    endCall();
    if (myPeer) myPeer.destroy();
    window.location.hash = '';
    location.reload();
  }
}

// ===== YOUTUBE SYNC LOGIC =====
let currentVideoId = 'jfKfPfyJRdk'; // Default Lofi Girl

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
    sendData({ type: 'video-play', currentTime });
    showSyncStatus('▶️ Memutar video...');
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime();
    sendData({ type: 'video-pause', currentTime });
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

function seekRelative(seconds) {
  if (!player || !playerReady) return;
  const newTime = Math.max(0, player.getCurrentTime() + seconds);
  player.seekTo(newTime, true);
  sendData({ type: 'video-seek', currentTime: newTime });
}

function seekTo(event) {
  if (!player || !playerReady) return;
  const bar = document.getElementById('progressBar');
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const newTime = ratio * player.getDuration();
  player.seekTo(newTime, true);
  sendData({ type: 'video-seek', currentTime: newTime });
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
  sendData({ type: 'video-change', videoId });
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

// Fullscreen Cinema Landscape Mode
function toggleFullscreenCinema() {
  const isCinema = document.body.classList.toggle('cinema-fullscreen');
  const btn = document.getElementById('btnFullscreen');

  // Sync streams to cinema boxes if active
  syncCinemaStreams();

  if (isCinema) {
    if (btn) btn.innerHTML = '✖ Keluar Fullscreen';

    // Update labels
    const cl = document.getElementById('cinemaLocalLabel');
    const cr = document.getElementById('cinemaRemoteLabel');
    if (cl) cl.textContent = myName ? `${myName} 💖` : 'Kamu 💖';
    if (cr) cr.textContent = 'Pasangan 💕';

    // Request fullscreen on video container or document
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => console.log('Fullscreen blocked:', err));
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }

    // Try screen orientation lock
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
    showToast('Keluar dari Mode Bioskop');
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
async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
    const localOverlay = document.getElementById('localOverlay');
    if (localOverlay) localOverlay.style.display = 'none';

    syncCinemaStreams();
  } catch (e) {
    console.warn('Camera/Mic permission denied:', e);
    showToast('⚠️ Izin kamera/mic diperlukan untuk video call');
  }
}

async function toggleCall() {
  if (isCalling) {
    endCall();
  } else {
    await startLocalStream();
    if (!localStream) return;

    isCalling = true;
    updateCallBtn();

    // Call all connected peers
    if (isHost) {
      guestConns.forEach((conn) => {
        callPeer(conn.peer);
      });
    } else {
      const hostId = getHostPeerId(currentRoom);
      callPeer(hostId);
    }

    addSystemMessage('📹 Memulai panggilan video...');
    showToast('📹 Video call aktif. Menghubungkan ke pasangan...');
  }
}

function callPeer(targetPeerId) {
  if (!myPeer || !localStream) return;
  console.log('Calling peer:', targetPeerId);
  const call = myPeer.call(targetPeerId, localStream);
  handleMediaCallStream(call);
}

function handleMediaCallStream(call) {
  mediaCalls.set(call.peer, call);

  call.on('stream', (remoteStream) => {
    console.log('Received remote stream!');
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = remoteStream;
    const overlay = document.getElementById('remoteOverlay');
    if (overlay) overlay.style.display = 'none';
    isCalling = true;
    updateCallBtn();

    syncCinemaStreams();
    addSystemMessage('📹 Pasangan terhubung di video call!');
  });

  call.on('close', () => {
    removeRemoteVideo();
  });

  call.on('error', (err) => {
    console.error('Call error:', err);
    removeRemoteVideo();
  });
}

function removeRemoteVideo() {
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) remoteVideo.srcObject = null;
  const overlay = document.getElementById('remoteOverlay');
  if (overlay) overlay.style.display = 'flex';
  const overlayText = document.getElementById('remoteOverlayText');
  if (overlayText) overlayText.textContent = 'Menunggu Pasangan...';
}

function endCall() {
  mediaCalls.forEach((call) => call.close());
  mediaCalls.clear();

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = null;
  const localOverlay = document.getElementById('localOverlay');
  if (localOverlay) localOverlay.style.display = 'flex';

  removeRemoteVideo();

  isCalling = false;
  updateCallBtn();
  addSystemMessage('📹 Video call diakhiri');
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
  localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  document.getElementById('btnMic').textContent = micEnabled ? '🎤' : '🔇';
  showToast(micEnabled ? '🎤 Mic Nyala' : '🔇 Mic Mati');
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
  document.getElementById('btnCam').textContent = camEnabled ? '📷' : '🚫';
  showToast(camEnabled ? '📷 Kamera Nyala' : '🚫 Kamera Mati');
}

// ===== CHAT =====
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
  sendData(msgData);
  input.value = '';
  clearTyping();
}

function handleChatKey(event) {
  if (event.key === 'Enter') sendMessage();
}

function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    sendData({ type: 'typing', userName: myName });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 1500);
}

function clearTyping() {
  if (isTyping) {
    isTyping = false;
    sendData({ type: 'stop-typing' });
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
  sendData({ type: 'emoji', emoji, userName: myName });
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

// ===== ONLINE COUNT =====
function updateOnlineCount(count) {
  const el = document.getElementById('onlineCount');
  if (el) el.textContent = count;
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
  const shareUrl = `${window.location.origin}${window.location.pathname}#${currentRoom}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('📋 Link ruangan disalin! Tinggal kirim ke Velin 💕');
  }).catch(() => {
    navigator.clipboard.writeText(currentRoom);
    showToast('📋 Kode disalin: ' + currentRoom);
  });
  closeModal();
}

// ===== TOAST =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
