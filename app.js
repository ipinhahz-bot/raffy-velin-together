// ===== RAFFY & VELIN TOGETHER - STABLE REALTIME ENGINE =====
const CLIENT_ID = 'user_' + Math.random().toString(36).substring(2, 9);
let myName = '';
let currentRoom = '';
let isHost = false;
let partnerId = '';
let partnerName = '';
let modalClosed = false;

// Realtime MQTT (HiveMQ Public Global WSS Broker)
let mqttClient = null;

// WebRTC Direct Stream & Audio
let peerConnection = null;
let localStream = null;
let isCalling = false;
let micEnabled = true;
let camEnabled = true;

// YouTube Player Sync
let player = null;
let playerReady = false;
let isSyncing = false;
let isPlaying = false;
let progressInterval = null;
let currentVideoId = 'jfKfPfyJRdk'; // Default video: Lo-Fi beats

// ICE Configuration (Google STUN + Cloudflare + OpenRelay TURN for Cellular NAT)
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// ===== INIT =====
window.onload = () => {
  generateHearts();
  loadYouTubeAPI();

  // Load saved name from localStorage if available
  const savedName = localStorage.getItem('rv_name');
  if (savedName) {
    const inputName = document.getElementById('inputName');
    if (inputName) inputName.value = savedName;
  }

  // Auto-fill room from URL Hash (e.g. #ABC123)
  const hashRoom = window.location.hash.replace('#', '').trim().toUpperCase();
  if (hashRoom) {
    const inputRoom = document.getElementById('inputRoom');
    if (inputRoom) inputRoom.value = hashRoom;
    showToast('🔑 Kode ruangan terisi dari link: ' + hashRoom);
  }
};

// ===== FLOATING HEARTS BACKGROUND =====
function generateHearts() {
  const container = document.getElementById('heartsBg');
  if (!container) return;
  const emojis = ['💕', '🌸', '✨', '💗', '🌺', '💓', '🧸', '💐'];
  for (let i = 0; i < 15; i++) {
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
  localStorage.setItem('rv_name', name);
  currentRoom = generateRoomId();
  document.getElementById('inputRoom').value = currentRoom;
  isHost = true;
  connectToMqttRoom();
}

function joinRoom() {
  const name = document.getElementById('inputName').value.trim();
  const room = document.getElementById('inputRoom').value.trim().toUpperCase();

  if (!name) { showToast('⚠️ Masukkan nama kamu dulu!'); return; }
  if (!room) { showToast('⚠️ Masukkan kode ruangan!'); return; }

  myName = name;
  localStorage.setItem('rv_name', name);
  currentRoom = room;
  isHost = false;
  connectToMqttRoom();
}

// ===== REALTIME MQTT PROTOCOL (HIVEMQ WSS) =====
function getRoomTopic() {
  return `raffyvelin/room/${currentRoom.toLowerCase()}`;
}

function connectToMqttRoom() {
  showToast('🔄 Menghubungkan ke ruangan...');
  window.location.hash = currentRoom;

  enterApp();

  try {
    mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: CLIENT_ID,
      keepalive: 60,
      clean: true
    });

    mqttClient.on('connect', () => {
      console.log('MQTT Connected as', CLIENT_ID);
      const topic = getRoomTopic();
      mqttClient.subscribe(topic, { qos: 0 }, (err) => {
        if (!err) {
          console.log('Subscribed to topic:', topic);
          showToast(`💕 Terhubung ke ruangan ${currentRoom}!`);
          addSystemMessage(`💕 Kamu (${myName}) siap di ruangan ${currentRoom}`);

          // Broadcast kehadiran ke pasangan
          broadcastSignal({
            type: 'user-joined',
            senderId: CLIENT_ID,
            userName: myName,
            isHost: isHost
          });
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        // Abaikan pesan yang dikirim oleh diri sendiri
        if (data.senderId === CLIENT_ID) return;

        handleSignalMessage(data);
      } catch (err) {
        console.error('MQTT message error:', err);
      }
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT error:', err);
    });

    mqttClient.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

  } catch (e) {
    console.error('MQTT init error:', e);
  }
}

function broadcastSignal(msg) {
  if (mqttClient && mqttClient.connected) {
    msg.senderId = CLIENT_ID;
    const topic = getRoomTopic();
    mqttClient.publish(topic, JSON.stringify(msg), { qos: 0 });
  }
}

// ===== SIGNAL HANDLING (WEBRTC & APP SYNC) =====
async function handleSignalMessage(data) {
  switch (data.type) {
    case 'user-joined':
      partnerId = data.senderId;
      partnerName = data.userName;
      updateOnlineCount(2);
      addSystemMessage(`💕 ${data.userName} bergabung ke ruangan!`);
      showToast(`💕 ${data.userName} sudah terhubung!`);

      // Update label video remote
      const rLabel = document.getElementById('remoteLabel');
      if (rLabel) rLabel.textContent = `${data.userName} 💕`;
      const cLabel = document.getElementById('cinemaRemoteLabel');
      if (cLabel) cLabel.textContent = `${data.userName} 💕`;

      // Balas sinyal bahwa kita juga ada di sini (handshake)
      broadcastSignal({
        type: 'user-ack',
        userName: myName,
        isHost: isHost
      });

      // Jika kita host dan video lagi jalan, sinkronkan video ke dia
      if (isHost && player && playerReady) {
        broadcastSignal({
          type: 'room-state',
          video: {
            videoId: currentVideoId,
            currentTime: player.getCurrentTime ? player.getCurrentTime() : 0,
            playing: isPlaying
          }
        });
      }

      // Jika kamera kita sudah nyala, otomatis ajak panggilan
      if (isCalling && localStream) {
        setTimeout(() => initiateWebRtcCall(), 800);
      }
      break;

    case 'user-ack':
      partnerId = data.senderId;
      partnerName = data.userName;
      updateOnlineCount(2);
      addSystemMessage(`💕 ${data.userName} ada di ruangan!`);
      const rLabelAck = document.getElementById('remoteLabel');
      if (rLabelAck) rLabelAck.textContent = `${data.userName} 💕`;
      const cLabelAck = document.getElementById('cinemaRemoteLabel');
      if (cLabelAck) cLabelAck.textContent = `${data.userName} 💕`;

      if (isCalling && localStream) {
        setTimeout(() => initiateWebRtcCall(), 800);
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
      showToast(`${data.userName}: ${data.emoji}`);
      break;

    // YouTube Synchronized Controls
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
    case 'call-request':
      showToast(`📹 ${data.userName} menyalakan kamera!`);
      if (!localStream) {
        // Jika kita belum aktifkan kamera, tawarkan aktivasi
        const localOverlayText = document.getElementById('localOverlayText');
        if (localOverlayText) localOverlayText.textContent = 'Ketuk untuk Masuk VC';
      }
      break;

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
          console.error('ICE candidate error:', e);
        }
      }
      break;

    case 'call-ended':
      handleRemoteCallEnded();
      break;
  }
}

// ===== WEBRTC VIDEO CALL ENGINE =====
function createPeerConnection() {
  if (peerConnection) {
    try { peerConnection.close(); } catch (e) {}
    peerConnection = null;
  }

  peerConnection = new RTCPeerConnection(ICE_CONFIG);

  // Masukkan audio & video track lokal
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Tangkap video pasangan
  peerConnection.ontrack = (event) => {
    console.log('Incoming remote stream track!');
    const stream = event.streams[0];

    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) {
      remoteVid.srcObject = stream;
      remoteVid.play().catch(e => console.log('Autoplay remote error:', e));
    }

    const remoteOverlay = document.getElementById('remoteOverlay');
    if (remoteOverlay) remoteOverlay.style.display = 'none';

    syncCinemaStreams();

    isCalling = true;
    updateCallBtn();
    addSystemMessage('📹 Wajah pasangan sudah tampil di layar!');
    showToast('📹 Pasangan terhubung di video call!');
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      broadcastSignal({
        type: 'webrtc-ice',
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('PeerConnection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      handleRemoteCallEnded();
    }
  };

  return peerConnection;
}

// Mulai kamera lokal
async function startLocalStream() {
  if (localStream) return true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: true
    });

    const localVid = document.getElementById('localVideo');
    if (localVid) {
      localVid.srcObject = localStream;
      localVid.play().catch(e => console.log('Autoplay local error:', e));
    }

    const localOverlay = document.getElementById('localOverlay');
    if (localOverlay) localOverlay.style.display = 'none';

    syncCinemaStreams();
    showToast('📷 Kamera & Mic kamu aktif!');
    return true;
  } catch (err) {
    console.error('Media devices error:', err);
    showToast('⚠️ Klik Izinkan Kamera & Mikrofon di browser HP!');
    const localOverlayText = document.getElementById('localOverlayText');
    if (localOverlayText) localOverlayText.textContent = 'Ketuk untuk Izinkan Kamera';
    return false;
  }
}

// Toggle panggilan VC
async function toggleCall() {
  if (isCalling && localStream) {
    endCall();
    broadcastSignal({ type: 'call-ended' });
  } else {
    showToast('📷 Membuka kamera...');
    const ok = await startLocalStream();
    if (!ok) return;

    isCalling = true;
    updateCallBtn();

    // Beritahu pasangan & inisiasi offer
    broadcastSignal({ type: 'call-request', userName: myName });
    initiateWebRtcCall();
    addSystemMessage('📹 Memulai video call, menunggu pasangan...');
  }
}

async function initiateWebRtcCall() {
  const pc = createPeerConnection();
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1
    });
    await pc.setLocalDescription(offer);
    broadcastSignal({
      type: 'webrtc-offer',
      offer: offer,
      userName: myName
    });
  } catch (err) {
    console.error('Create offer error:', err);
  }
}

async function handleWebRtcOffer(offer, callerName) {
  // Pastikan kamera kita juga siap
  await startLocalStream();

  const pc = createPeerConnection();
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    broadcastSignal({
      type: 'webrtc-answer',
      answer: answer
    });

    isCalling = true;
    updateCallBtn();
    showToast(`📹 Menghubungkan video dengan ${callerName}...`);
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
}

function endCall() {
  if (peerConnection) {
    try { peerConnection.close(); } catch (e) {}
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
  addSystemMessage('📹 Video call diakhiri');
  showToast('📹 Video call dimatikan');
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
  if (!localStream) {
    showToast('⚠️ Nyalakan kamera/VC dulu!');
    return;
  }
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
  const btn = document.getElementById('btnMic');
  if (btn) btn.textContent = micEnabled ? '🎤' : '🔇';
  showToast(micEnabled ? '🎤 Mic Nyala' : '🔇 Mic Mati');
}

function toggleCam() {
  if (!localStream) {
    showToast('⚠️ Nyalakan kamera/VC dulu!');
    return;
  }
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach((t) => { t.enabled = camEnabled; });
  const btn = document.getElementById('btnCam');
  if (btn) btn.textContent = camEnabled ? '📷' : '🚫';
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
    if (cr) cr.textContent = partnerName ? `${partnerName} 💕` : 'Pasangan 💕';

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
    cinemaLocal.play().catch(() => {});
  }
  if (cinemaRemote && remoteVid && remoteVid.srcObject) {
    cinemaRemote.srcObject = remoteVid.srcObject;
    cinemaRemote.play().catch(() => {});
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
    broadcastSignal({ type: 'video-play', currentTime });
    showSyncStatus('▶️ Memutar video...');
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime();
    broadcastSignal({ type: 'video-pause', currentTime });
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
  broadcastSignal({ type: 'video-seek', currentTime: newTime });
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
  broadcastSignal({ type: 'video-change', videoId });
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

  // Tampilkan modal kode ruangan HANYA 1 KALI untuk pembuat ruangan (Host)
  if (isHost && !modalClosed) {
    setTimeout(() => {
      const modal = document.getElementById('modalOverlay');
      if (modal && !modalClosed) {
        document.getElementById('modalRoomCode').textContent = currentRoom;
        modal.classList.add('open');
        modal.style.display = 'flex';
      }
    }, 400);
  }
}

function leaveRoom() {
  if (confirm('Keluar dari ruangan?')) {
    endCall();
    if (mqttClient) mqttClient.end();
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
  broadcastSignal(msgData);
  input.value = '';
  clearTyping();
}

function handleChatKey(event) {
  if (event.key === 'Enter') sendMessage();
}

function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    broadcastSignal({ type: 'typing', userName: myName });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 1500);
}

function clearTyping() {
  if (isTyping) {
    isTyping = false;
    broadcastSignal({ type: 'stop-typing' });
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
  broadcastSignal({ type: 'emoji', emoji, userName: myName });
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

// ===== ROOM CODE MODAL & COPY =====
function copyRoomId() {
  document.getElementById('modalRoomCode').textContent = currentRoom;
  const modal = document.getElementById('modalOverlay');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

function closeModal() {
  modalClosed = true;
  const modal = document.getElementById('modalOverlay');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function copyAndClose() {
  const shareUrl = `${window.location.origin}${window.location.pathname}#${currentRoom}`;
  closeModal();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('📋 Link disalin! Tinggal kirim ke Velin 💕');
    }).catch(() => {
      showToast('📋 Kode ruangan: ' + currentRoom);
    });
  } else {
    showToast('📋 Kode ruangan: ' + currentRoom);
  }
}

// ===== TOAST NOTIFICATION =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
