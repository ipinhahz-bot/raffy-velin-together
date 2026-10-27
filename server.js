const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Store room state
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        video: { url: '', playing: false, currentTime: 0, lastUpdated: Date.now() }
      };
    }

    rooms[roomId].users.push({ id: socket.id, name: userName });

    // Notify others in room
    socket.to(roomId).emit('user-joined', { userId: socket.id, userName });

    // Send current room state to new user
    socket.emit('room-state', rooms[roomId]);

    // Send list of other users for WebRTC
    const otherUsers = rooms[roomId].users.filter(u => u.id !== socket.id);
    socket.emit('room-users', otherUsers);

    console.log(`${userName} joined room ${roomId}`);
  });

  // Chat message
  socket.on('chat-message', ({ roomId, message, userName }) => {
    const msgData = {
      id: Date.now(),
      message,
      userName,
      userId: socket.id,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
    io.to(roomId).emit('chat-message', msgData);
  });

  // Video sync events
  socket.on('video-play', ({ roomId, currentTime }) => {
    if (rooms[roomId]) {
      rooms[roomId].video.playing = true;
      rooms[roomId].video.currentTime = currentTime;
      rooms[roomId].video.lastUpdated = Date.now();
    }
    socket.to(roomId).emit('video-play', { currentTime });
  });

  socket.on('video-pause', ({ roomId, currentTime }) => {
    if (rooms[roomId]) {
      rooms[roomId].video.playing = false;
      rooms[roomId].video.currentTime = currentTime;
    }
    socket.to(roomId).emit('video-pause', { currentTime });
  });

  socket.on('video-seek', ({ roomId, currentTime }) => {
    if (rooms[roomId]) {
      rooms[roomId].video.currentTime = currentTime;
    }
    socket.to(roomId).emit('video-seek', { currentTime });
  });

  socket.on('video-change', ({ roomId, url, videoId }) => {
    if (rooms[roomId]) {
      rooms[roomId].video.url = url;
      rooms[roomId].video.videoId = videoId;
      rooms[roomId].video.playing = false;
      rooms[roomId].video.currentTime = 0;
    }
    io.to(roomId).emit('video-change', { url, videoId });
  });

  // WebRTC signaling
  socket.on('webrtc-offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc-offer', {
      callerId: socket.id,
      callerName: socket.userName,
      offer
    });
  });

  socket.on('webrtc-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc-answer', {
      answererId: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc-ice', {
      senderId: socket.id,
      candidate
    });
  });

  // Emoji reaction
  socket.on('emoji-reaction', ({ roomId, emoji, userName }) => {
    io.to(roomId).emit('emoji-reaction', { emoji, userName, userId: socket.id });
  });

  // Typing indicator
  socket.on('typing', ({ roomId, userName }) => {
    socket.to(roomId).emit('typing', { userName });
  });

  socket.on('stop-typing', ({ roomId }) => {
    socket.to(roomId).emit('stop-typing');
  });

  // Disconnect
  socket.on('disconnect', () => {
    const { roomId, userName } = socket;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id, userName });

      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💕 Raffy & Velin Server running on port ${PORT}`);
});
