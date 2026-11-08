// ===== RAFFY & VELIN TOGETHER - STABLE REALTIME ENGINE =====
const CLIENT_ID = 'user_' + Math.random().toString(36).substring(2, 9);
let myName = '';
let currentRoom = '';
let isHost = false;
let isPolite = false;
let partnerId = '';
let partnerName = '';
let modalClosed = false;

// Realtime MQTT (HiveMQ Public Global WSS Broker)
let mqttClient = null;
let signalQueue = [];

// WebRTC Direct Stream & Audio
let peerConnection = null;
let localStream = null;
let isCalling = false;
let micEnabled = true;
let camEnabled = true;
let iceCandidatesQueue = [];
let makingOffer = false;
let ignoreOffer = false;
let pendingOffer = null;

// YouTube Player Sync & Anti-Loop Engine
let player = null;
let playerReady = false;
let isPlaying = false;
let isRemoteAction = false;
let progressInterval = null;
let currentVideoId = '2Vv-BfVoq4g'; // Default video: Ed Sheeran - Perfect

// ICE Configuration (Google STUN + Cloudflare + Metered Global TURN for Cellular NAT)
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:global.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
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

  // Handle native fullscreen exit (Android back button, swipe)
  const handleFsChange = () => {
    const isNativeFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isNativeFs && document.body.classList.contains('cinema-fullscreen')) {
      document.body.classList.remove('cinema-fullscreen');
      const btn = document.getElementById('btnFullscreen');
      if (btn) btn.innerHTML = '⛶ Fullscreen';
    }
  };
  document.addEventListener('fullscreenchange', handleFsChange);
  document.addEventListener('webkitfullscreenchange', handleFsChange);
};

// ===== AUDIO NOTIFICATION ENGINE (WEB AUDIO API - ZERO ASSET DEPENDENCY) =====
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Unlock audio on first touch/click anywhere on page
window.addEventListener('click', () => { getAudioContext(); }, { passive: true });
window.addEventListener('touchstart', () => { getAudioContext(); }, { passive: true });

// 1. Suara Pasangan Masuk Ruangan (Sweet Chime)
function playJoinSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, time: now, dur: 0.16 },         // D5
      { freq: 739.99, time: now + 0.12, dur: 0.18 },   // F#5
      { freq: 880.00, time: now + 0.26, dur: 0.38 }    // A5
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, n.time);
      gain.gain.setValueAtTime(0.001, n.time);
      gain.gain.exponentialRampToValueAtTime(0.2, n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, n.time + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(n.time);
      osc.stop(n.time + n.dur);
    });
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

// 2. Suara Notifikasi Chat (Sweet "Ting!" Bell)
function playChatSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

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
  isPolite = false; // Host is impolite in WebRTC negotiation
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
  isPolite = true; // Guest is polite in WebRTC negotiation
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
      mqttClient.subscribe(topic, { qos: 1 }, (err) => {
        if (!err) {
          console.log('Subscribed to topic:', topic);
          showToast(`💕 Terhubung ke ruangan ${currentRoom}!`);

          // Kirim pesan antrian jika ada
          while (signalQueue.length > 0) {
            const queued = signalQueue.shift();
            try {
              mqttClient.publish(topic, JSON.stringify(queued), { qos: 1 });
            } catch (e) {}
          }

          // Broadcast kehadiran ke pasangan
          broadcastSignal({
            type: 'user-joined',
            userName: myName,
            isHost: isHost
          });

          // Minta info sinkronisasi video & status terkini dari pasangan
          broadcastSignal({
            type: 'request-state'
          });
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.senderId === CLIENT_ID) return; // Abaikan pesan diri sendiri
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
  msg.senderId = CLIENT_ID;
  if (mqttClient && mqttClient.connected) {
    const topic = getRoomTopic();
    try {
      mqttClient.publish(topic, JSON.stringify(msg), { qos: 1 });
    } catch (e) {
      console.error('MQTT publish error:', e);
    }
  } else {
    signalQueue.push(msg);
  }
}

// ===== SIGNAL HANDLING (WEBRTC & APP SYNC) =====
async function handleSignalMessage(data) {
  switch (data.type) {
    case 'user-joined':
      partnerId = data.senderId;
      partnerName = data.userName;
      updateOnlineCount(2);
      playJoinSound();
      showToast(`🔔 💕 <b>${escapeHtml(data.userName)}</b> sudah online di ruangan!`);

      // Update label video remote
      updateRemoteLabels(data.userName);

      // Balas sinyal bahwa kita ada di sini
      broadcastSignal({
        type: 'user-ack',
        userName: myName,
        isHost: isHost
      });

      // Sinkronkan video saat ini ke pasangan yang baru masuk
      sendRoomState();
      break;

    case 'user-ack':
      partnerId = data.senderId;
      partnerName = data.userName;
      updateOnlineCount(2);
      playJoinSound();
      showToast(`🔔 💕 <b>${escapeHtml(data.userName)}</b> online bersama kamu!`);
      updateRemoteLabels(data.userName);
      break;

    case 'request-state':
      sendRoomState();
      break;

    case 'room-state':
      if (data.video && data.video.videoId) {
        if (data.video.videoId !== currentVideoId) {
          currentVideoId = data.video.videoId;
          isRemoteAction = true;
          loadYouTubeById(data.video.videoId, data.video.currentTime || 0, data.video.playing);
        } else if (player && playerReady) {
          const myTime = player.getCurrentTime ? player.getCurrentTime() : 0;
          if (Math.abs(myTime - data.video.currentTime) > 4) {
            player.seekTo(data.video.currentTime, true);
          }
          if (data.video.playing) {
            isRemoteAction = true;
            player.playVideo();
          } else {
            isRemoteAction = true;
            player.pauseVideo();
          }
        }
      }
      if (data.isCalling && !localStream) {
        showIncomingCallModal(partnerName || data.userName);
      }
      break;

    case 'chat':
      appendMessage(data, false);
      playChatSound();
      showToast(`💬 <b>${escapeHtml(data.userName)}</b>: ${escapeHtml(data.message)}`);
      break;

    case 'typing':
      const tip = document.getElementById('typingIndicator');
      if (tip) tip.textContent = `${data.userName} sedang mengetik...`;
      break;

    case 'stop-typing':
      const tipStop = document.getElementById('typingIndicator');
      if (tipStop) tipStop.textContent = '';
      break;

    case 'emoji':
      floatEmoji(data.emoji);
      showToast(`${data.userName}: ${data.emoji}`);
      break;

    // YouTube Synchronized Controls (Zero-Looping)
    case 'video-play':
      if (player && playerReady) {
        isRemoteAction = true;
        const myTime = player.getCurrentTime ? player.getCurrentTime() : 0;
        // Hanya seek jika selisih waktu lebih dari 4 detik agar tidak tersendat-sendat
        if (Math.abs(myTime - data.currentTime) > 4) {
          player.seekTo(data.currentTime, true);
        }
        player.playVideo();
        isPlaying = true;
        updatePlayPauseBtn();
        showSyncStatus('▶️ Diputar bersama');
      }
      break;

    case 'video-pause':
      if (player && playerReady) {
        isRemoteAction = true;
        const myTime = player.getCurrentTime ? player.getCurrentTime() : 0;
        if (Math.abs(myTime - data.currentTime) > 4) {
          player.seekTo(data.currentTime, true);
        }
        player.pauseVideo();
        isPlaying = false;
        updatePlayPauseBtn();
        showSyncStatus('⏸️ Dijeda bersama');
      }
      break;

    case 'video-seek':
      if (player && playerReady) {
        isRemoteAction = true;
        player.seekTo(data.currentTime, true);
        showSyncStatus('⏩ Digeser bersama');
      }
      break;

    case 'video-change':
      showToast(`🎬 ${data.userName || 'Pasangan'} mengganti video!`);
      currentVideoId = data.videoId;
      isRemoteAction = true;
      loadYouTubeById(data.videoId, 0, true);
      showSyncStatus('🎬 Video baru diputar bersama!');
      break;

    // WebRTC Signaling
    case 'call-request':
      if (!localStream) {
        showIncomingCallModal(data.userName);
      } else {
        initiateWebRtcCall();
      }
      break;

    case 'webrtc-offer':
      await handleWebRtcOffer(data.offer, data.userName);
      break;

    case 'webrtc-answer':
      await handleWebRtcAnswer(data.answer);
      break;

    case 'webrtc-ice':
      await addIceCandidateSafely(data.candidate);
      break;

    case 'call-ended':
      handleRemoteCallEnded();
      break;
  }
}

function updateRemoteLabels(name) {
  const rLabel = document.getElementById('remoteLabel');
  if (rLabel) rLabel.textContent = `${name} 💕`;
  const cLabel = document.getElementById('cinemaRemoteLabel');
  if (cLabel) cLabel.textContent = `${name} 💕`;
}

function sendRoomState() {
  if (player && playerReady) {
    const curTime = player.getCurrentTime ? player.getCurrentTime() : 0;
    broadcastSignal({
      type: 'room-state',
      video: {
        videoId: currentVideoId,
        currentTime: curTime,
        playing: isPlaying
      },
      isCalling: isCalling && localStream !== null
    });
  }
}

// ===== WEBRTC VIDEO CALL ENGINE (PERFECT NEGOTIATION) =====
function getOrCreatePeerConnection() {
  if (peerConnection && peerConnection.signalingState !== 'closed') {
    return peerConnection;
  }

  peerConnection = new RTCPeerConnection(ICE_CONFIG);

  // Masukkan audio & video track lokal jika sudah ada
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Tangkap video pasangan
  peerConnection.ontrack = (event) => {
    console.log('Incoming remote stream track!', event.track.kind);
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

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
    showToast(`📹 Wajah ${partnerName || 'pasangan'} sudah tampil! 💕`);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      broadcastSignal({
        type: 'webrtc-ice',
        candidate: event.candidate
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === 'failed') {
      console.log('ICE failed, restarting ICE...');
      peerConnection.restartIce();
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

async function addIceCandidateSafely(candidate) {
  if (!candidate) return;
  if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Add ICE candidate error:', e);
    }
  } else {
    iceCandidatesQueue.push(candidate);
  }
}

async function flushIceCandidates() {
  if (!peerConnection || !peerConnection.remoteDescription) return;
  while (iceCandidatesQueue.length > 0) {
    const candidate = iceCandidatesQueue.shift();
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Flush ICE candidate error:', e);
    }
  }
}

// Mulai kamera lokal dengan penanganan izin mobile yang ramah
async function startLocalStream() {
  if (localStream) return true;

  try {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true
      });
    } catch (e1) {
      console.warn('Ideal constraints failed, fallback to basic:', e1);
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
    }

    const localVid = document.getElementById('localVideo');
    if (localVid) {
      localVid.srcObject = localStream;
      localVid.play().catch(e => console.log('Autoplay local error:', e));
    }

    const localOverlay = document.getElementById('localOverlay');
    if (localOverlay) localOverlay.style.display = 'none';

    // Tambahkan track ke peerConnection jika sudah ada
    if (peerConnection) {
      const senders = peerConnection.getSenders();
      localStream.getTracks().forEach((track) => {
        const exists = senders.some(s => s.track && s.track.kind === track.kind);
        if (!exists) {
          peerConnection.addTrack(track, localStream);
        }
      });
    }

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

    broadcastSignal({ type: 'call-request', userName: myName });
    initiateWebRtcCall();
    showToast('📹 Menghubungi pasangan...');
  }
}

async function initiateWebRtcCall() {
  const pc = getOrCreatePeerConnection();
  try {
    makingOffer = true;
    const offer = await pc.createOffer({
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1
    });
    if (pc.signalingState !== 'stable') return;
    await pc.setLocalDescription(offer);
    broadcastSignal({
      type: 'webrtc-offer',
      offer: pc.localDescription,
      userName: myName
    });
  } catch (err) {
    console.error('Create offer error:', err);
  } finally {
    makingOffer = false;
  }
}

async function handleWebRtcOffer(offer, callerName) {
  // Jika user belum menyalakan kamera, munculkan modal ajakan VC (agar ada user gesture)
  if (!localStream) {
    pendingOffer = offer;
    showIncomingCallModal(callerName);
    return;
  }

  const pc = getOrCreatePeerConnection();
  const offerCollision = (makingOffer || pc.signalingState !== 'stable');
  ignoreOffer = !isPolite && offerCollision;

  if (ignoreOffer) {
    console.log('Ignored offer due to collision (impolite)');
    return;
  }

  try {
    if (offerCollision && isPolite) {
      console.log('Rolling back local offer (polite)');
      await pc.setLocalDescription({ type: 'rollback' });
    }
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    broadcastSignal({
      type: 'webrtc-answer',
      answer: pc.localDescription
    });

    isCalling = true;
    updateCallBtn();
    showToast(`📹 Terhubung dengan ${callerName || partnerName || 'pasangan'}! 💕`);
  } catch (err) {
    console.error('Handle offer error:', err);
  }
}

async function handleWebRtcAnswer(answer) {
  if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIceCandidates();
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
  iceCandidatesQueue = [];

  const localVid = document.getElementById('localVideo');
  if (localVid) localVid.srcObject = null;
  const localOverlay = document.getElementById('localOverlay');
  if (localOverlay) localOverlay.style.display = 'flex';

  handleRemoteCallEnded();
  isCalling = false;
  updateCallBtn();
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

// ===== INCOMING CALL MODAL (USER GESTURE FRIENDLY) =====
function showIncomingCallModal(callerName) {
  const modal = document.getElementById('callModalOverlay');
  const title = document.getElementById('callModalTitle');
  if (title) title.textContent = `${callerName || 'Pasangan'} Mengajak Video Call! 💕`;
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
  showToast(`📹 ${callerName || 'Pasangan'} mengajak Video Call!`);
}

async function acceptIncomingCall() {
  const modal = document.getElementById('callModalOverlay');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }

  showToast('📷 Menyalakan kamera...');
  const ok = await startLocalStream();
  if (!ok) return;

  isCalling = true;
  updateCallBtn();

  if (pendingOffer) {
    const offer = pendingOffer;
    pendingOffer = null;
    await handleWebRtcOffer(offer, partnerName);
  } else {
    initiateWebRtcCall();
  }
}

function rejectIncomingCall() {
  pendingOffer = null;
  const modal = document.getElementById('callModalOverlay');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
  showToast('VC ditolak');
}

// ===== CINEMA FULLSCREEN LANDSCAPE & DRAGGABLE VC =====
function initCinemaDraggable() {
  const box = document.getElementById('cinemaVcBar');
  if (!box) return;

  let isDragging = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;

  function onPointerDown(e) {
    if (e.target.closest('button')) return;

    const isTouch = e.type.startsWith('touch');
    const pageX = isTouch ? e.touches[0].clientX : e.clientX;
    const pageY = isTouch ? e.touches[0].clientY : e.clientY;

    isDragging = true;
    startX = pageX;
    startY = pageY;

    const rect = box.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;

    box.style.right = 'auto';
    box.style.bottom = 'auto';
    box.style.left = initLeft + 'px';
    box.style.top = initTop + 'px';

    if (isTouch) {
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
      window.addEventListener('touchcancel', onPointerUp);
    } else {
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
    }
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const isTouch = e.type.startsWith('touch');
    const pageX = isTouch ? e.touches[0].clientX : e.clientX;
    const pageY = isTouch ? e.touches[0].clientY : e.clientY;

    const dx = pageX - startX;
    const dy = pageY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (e.cancelable) e.preventDefault();
    }

    const maxX = window.innerWidth - box.offsetWidth - 8;
    const maxY = window.innerHeight - box.offsetHeight - 8;

    const newLeft = Math.max(8, Math.min(maxX, initLeft + dx));
    const newTop = Math.max(8, Math.min(maxY, initTop + dy));

    box.style.left = newLeft + 'px';
    box.style.top = newTop + 'px';
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
    window.removeEventListener('touchcancel', onPointerUp);
  }

  box.addEventListener('mousedown', onPointerDown);
  box.addEventListener('touchstart', onPointerDown, { passive: false });
}

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

  if (cinemaLocal) {
    const src = localStream || (localVid && localVid.srcObject);
    if (src && cinemaLocal.srcObject !== src) {
      cinemaLocal.srcObject = src;
      cinemaLocal.play().catch(() => {});
    } else if (!src) {
      cinemaLocal.srcObject = null;
    }
  }

  if (cinemaRemote) {
    const src = remoteVid && remoteVid.srcObject;
    if (src && cinemaRemote.srcObject !== src) {
      cinemaRemote.srcObject = src;
      cinemaRemote.play().catch(() => {});
    } else if (!src) {
      cinemaRemote.srcObject = null;
    }
  }
}

// ===== YOUTUBE SYNC LOGIC (ANTI-LOOP ENGINE) =====
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    initYouTubePlayer();
    return;
  }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function initYouTubePlayer() {
  if (player) return;
  if (!window.YT || !window.YT.Player) return;
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
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
}

window.onYouTubeIframeAPIReady = function() {
  initYouTubePlayer();
};

function onPlayerReady() {
  playerReady = true;
  updatePlayPauseBtn();
  startProgressTracker();
}

function onPlayerError(e) {
  console.warn('YouTube error code:', e.data);
  if (e.data === 101 || e.data === 150) {
    showToast('⚠️ Video ini dibatasi YouTube untuk diputar di web lain. Coba pilih link video YouTube yang lain ya!');
  } else {
    showToast('⚠️ Gagal memutar video. Cek link YouTube kamu!');
  }
}

function onPlayerStateChange(event) {
  // Jika perubahan status disebabkan oleh perintah dari pasangan, abaikan agar tidak terjadi ping-pong loop!
  if (isRemoteAction) {
    if (event.data === YT.PlayerState.PLAYING) {
      isPlaying = true;
      updatePlayPauseBtn();
      isRemoteAction = false;
    } else if (event.data === YT.PlayerState.PAUSED) {
      isPlaying = false;
      updatePlayPauseBtn();
      isRemoteAction = false;
    }
    return;
  }

  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
    broadcastSignal({ type: 'video-play', currentTime });
    showSyncStatus('▶️ Diputar bersama');
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseBtn();
    const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
    broadcastSignal({ type: 'video-pause', currentTime });
    showSyncStatus('⏸️ Dijeda bersama');
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
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const duration = player.getDuration ? player.getDuration() : 0;
  if (duration <= 0) return;

  const newTime = ratio * duration;
  player.seekTo(newTime, true);
  broadcastSignal({ type: 'video-seek', currentTime: newTime });
  showSyncStatus('⏩ Digeser bersama');
}

function startProgressTracker() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!player || !playerReady || !isPlaying) return;
    try {
      const current = player.getCurrentTime ? player.getCurrentTime() : 0;
      const duration = player.getDuration ? player.getDuration() : 0;
      if (duration > 0) {
        const pct = (current / duration) * 100;
        const fill = document.getElementById('progressFill');
        if (fill) fill.style.width = pct + '%';
        const timeEl = document.getElementById('timeDisplay');
        if (timeEl) timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      }
    } catch (e) {}
  }, 500);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// ===== GANTI VIDEO (INPUT NORMAL & MODAL BIOSKOP) =====
function toggleVideoInput() {
  const el = document.getElementById('videoInputArea');
  if (el) {
    const isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      const inp = document.getElementById('inputVideoUrl');
      if (inp) inp.focus();
    }
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

  input.value = '';
  toggleVideoInput();
  changeVideoTo(videoId);
}

function openChangeVideoModal() {
  const modal = document.getElementById('videoModalOverlay');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
    const inp = document.getElementById('modalVideoInput');
    if (inp) {
      inp.value = '';
      setTimeout(() => inp.focus(), 150);
    }
  }
}

function closeChangeVideoModal() {
  const modal = document.getElementById('videoModalOverlay');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function submitChangeVideo() {
  const inp = document.getElementById('modalVideoInput');
  if (!inp) return;
  const url = inp.value.trim();
  if (!url) {
    showToast('⚠️ Masukkan link YouTube!');
    return;
  }
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    showToast('❌ Link YouTube tidak valid!');
    return;
  }
  closeChangeVideoModal();
  changeVideoTo(videoId);
}

function changeVideoTo(videoId) {
  currentVideoId = videoId;
  showToast('🎬 Mengganti video...');
  isRemoteAction = true;
  loadYouTubeById(videoId, 0, true);
  broadcastSignal({
    type: 'video-change',
    videoId: videoId,
    userName: myName
  });
  showSyncStatus('🎬 Video baru dimuat bersama!');
}

function loadYouTubeById(id, startTime = 0, autoPlay = true) {
  if (!id) return;
  currentVideoId = id;
  isRemoteAction = true;

  if (player && playerReady && player.loadVideoById) {
    try {
      player.loadVideoById({
        videoId: id,
        startSeconds: startTime
      });
      if (!autoPlay && player.pauseVideo) {
        player.pauseVideo();
      }
    } catch (err) {
      console.warn('loadVideoById failed, fallback to cue:', err);
      if (player.cueVideoById) {
        player.cueVideoById({ videoId: id, startSeconds: startTime });
      }
    }
  } else {
    initYouTubePlayer();
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  const clean = url.trim();
  // Jika langsung kode ID 11 karakter
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

  // Mendukung link youtube.com (watch, embed, shorts, live) & youtu.be
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = clean.match(regExp);
  if (match && match[1]) return match[1];

  // Fallback regex
  const fallback = clean.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return (fallback && fallback[2] && fallback[2].length === 11) ? fallback[2] : null;
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

  initCinemaDraggable();

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
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
