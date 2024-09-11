import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = 'http://localhost:5000';

const App = () => {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [socket, setSocket] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (roomCode && username) {
      const newSocket = io(BACKEND_URL, {
        query: { roomCode, username },
        withCredentials: true
      });
      setSocket(newSocket);

      newSocket.on('message', (msg) => {
        setMessages((prevMessages) => [...prevMessages, msg]);
      });

      newSocket.on('chat', (data) => {
        setMessages((prevMessages) => [...prevMessages, `${data.username}: ${data.msg}`]);
      });

      newSocket.on('screen-shared', (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });

      newSocket.on('screen-share-stopped', () => {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setScreenSharing(false);
      });

      newSocket.on('update-participants', (count) => {
        setParticipantCount(count);
      });

      return () => newSocket.disconnect();
    }
  }, [roomCode, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createRoom = async () => {
    if (!username) {
      setError('Please enter a username');
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/create-room`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      setRoomCode(data.roomCode);
      setIsMaster(data.isMaster);
      setError('');
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const joinRoom = async () => {
    if (!username || !roomCode) {
      setError('Please enter both username and room code');
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/join-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, username }),
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setIsMaster(data.isMaster);
        setError('');
      } else {
        setError(data.message || 'Failed to join room');
      }
    } catch (err) {
      setError('Failed to join room');
    }
  };

  const shareScreen = () => {
    if (!isMaster) return;
    navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
      setScreenSharing(true);
      socket.emit('share-screen', stream);
      videoRef.current.srcObject = stream;
      
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    }).catch((err) => {
      console.error("Error sharing screen:", err);
      setError('Failed to share screen');
    });
  };

  const stopScreenShare = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setScreenSharing(false);
    socket.emit('stop-screen-share');
  };

  const sendMessage = () => {
    if (message && socket) {
      socket.emit('chat', message);
      setMessage('');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied to clipboard!');
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {!roomCode ? (
        <div>
          <h2>Join or Create a Room</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ margin: '5px', padding: '5px' }}
          />
          <input
            type="text"
            placeholder="Room Code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            style={{ margin: '5px', padding: '5px' }}
          />
          <button onClick={joinRoom} style={{ margin: '5px', padding: '5px' }}>Join</button>
          <button onClick={createRoom} style={{ margin: '5px', padding: '5px' }}>Create Room</button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: screenSharing ? 'row' : 'column' }}>
          <div style={{ flex: screenSharing ? '3' : '1', marginRight: screenSharing ? '20px' : '0' }}>
            <h2>Room: {roomCode} {isMaster && <button onClick={copyRoomCode}>Copy Code</button>}</h2>
            <p>Participants: {participantCount}/10</p>
            {isMaster && (
              <button onClick={screenSharing ? stopScreenShare : shareScreen} style={{ padding: '5px', marginBottom: '10px' }}>
                {screenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
            )}
            <video ref={videoRef} autoPlay style={{ width: '100%', display: screenSharing ? 'block' : 'none' }} />
          </div>
          <div style={{ flex: '1' }}>
            <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
              {messages.map((msg, index) => (
                <div key={index}>{msg}</div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <input
              type="text"
              placeholder="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ width: '70%', marginRight: '5px', padding: '5px' }}
            />
            <button onClick={sendMessage} style={{ width: '25%', padding: '5px' }}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;