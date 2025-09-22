
        let socket = null;
        let currentUserId = null;
        let targetUserId = null;

        function connectToChat() {
            currentUserId = document.getElementById('currentUserId').value.trim();
            targetUserId = document.getElementById('targetUserId').value.trim();

            if (!currentUserId || !targetUserId) {
                alert('Please enter both user IDs');
                return;
            }

            // Connect to Socket.IO with userId
            socket = io('http://localhost:3000', {
                query: { userId: currentUserId }
            });

            socket.on('connect', () => {
                document.getElementById('status').textContent = `Connected as ${currentUserId}`;
                document.getElementById('status').className = 'status connected';
                document.getElementById('chatArea').style.display = 'block';
                addSystemMessage(`Connected as ${currentUserId}`);
            });

            socket.on('disconnect', () => {
                document.getElementById('status').textContent = 'Disconnected';
                document.getElementById('status').className = 'status disconnected';
                addSystemMessage('Disconnected from server');
            });

            // Listen for new messages
            socket.on('newMessage', (message) => {
                addMessage(message, 'received');
            });

            // Listen for user online/offline status
            socket.on('userOnline', (userId) => {
                addSystemMessage(`User ${userId} came online`);
                updateOnlineUsers();
            });

            socket.on('userOffline', (userId) => {
                addSystemMessage(`User ${userId} went offline`);
                updateOnlineUsers();
            });

            // Listen for typing indicators
            socket.on('userTyping', ({ from }) => {
                if (from === targetUserId) {
                    addSystemMessage(`${from} is typing...`);
                }
            });

            socket.on('userStoppedTyping', ({ from }) => {
                if (from === targetUserId) {
                    addSystemMessage(`${from} stopped typing`);
                }
            });
        }

        function sendMessage() {
            const messageInput = document.getElementById('messageInput');
            const content = messageInput.value.trim();

            if (!content || !socket) {
                return;
            }

            // Send message via HTTP API
            fetch('http://localhost:3000/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: currentUserId,
                    to: targetUserId,
                    content: content
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === 'Message sent successfully') {
                    addMessage(data.data, 'sent');
                    messageInput.value = '';
                } else {
                    alert('Failed to send message: ' + JSON.stringify(data));
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to send message');
            });
        }

        function addMessage(message, type) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            
            const time = new Date(message.createdAt).toLocaleTimeString();
            messageDiv.innerHTML = `
                <div class="message-info">${type === 'sent' ? 'You' : message.from} - ${time}</div>
                <div class="message-content">${message.content}</div>
            `;
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function addSystemMessage(text) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = 'text-align: center; color: #666; font-style: italic; margin: 5px 0;';
            messageDiv.textContent = text;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function updateOnlineUsers() {
            // This is optional - you could implement an API to get online users
            const onlineDiv = document.getElementById('onlineUsers');
            onlineDiv.style.display = 'block';
            onlineDiv.innerHTML = '<strong>Online Status:</strong> Real-time updates enabled';
        }

        // Send message on Enter key
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('messageInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        });

        // Optional: Typing indicators
        let typingTimer;
        document.addEventListener('DOMContentLoaded', () => {
            const messageInput = document.getElementById('messageInput');
            
            messageInput.addEventListener('input', () => {
                if (socket && targetUserId) {
                    socket.emit('typing', { to: targetUserId, from: currentUserId });
                    
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(() => {
                        socket.emit('stopTyping', { to: targetUserId, from: currentUserId });
                    }, 1000);
                }
            });
        });
