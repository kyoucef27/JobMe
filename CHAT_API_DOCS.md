## Socket.IO Chat API Documentation

### Endpoints

#### 1. Send Message
**POST** `/api/chat/message`

**Body:**
```json
{
  "from": "user123",
  "to": "user456", 
  "content": "Hello there!"
}
```

**Response:**
```json
{
  "message": "Message sent successfully",
  "data": {
    "_id": "messageId",
    "from": "user123",
    "to": "user456",
    "content": "Hello there!",
    "createdAt": "2025-09-18T20:00:00.000Z",
    "read": false
  }
}
```

#### 2. Get Messages
**GET** `/api/chat/messages?userId1=user123&userId2=user456`

**Response:**
```json
{
  "messages": [
    {
      "_id": "messageId1",
      "from": "user123",
      "to": "user456",
      "content": "Hello!",
      "createdAt": "2025-09-18T20:00:00.000Z",
      "read": false
    }
  ]
}
```

### Socket.IO Events

#### Client Connection
```javascript

const socket = io('http://localhost:3000', {
  query: { userId: 'user123' }
});
```

#### Server Events

- **userOnline**: Emitted when a user connects
- **userOffline**: Emitted when a user disconnects  
- **newMessage**: Emitted to receiver when a new message is sent

#### Client Events (optional)

- **joinRoom**: Join a specific room
- **typing**: Notify when user is typing
- **stopTyping**: Notify when user stops typing
- **markAsRead**: Mark messages as read

### Testing with Postman + Socket.IO Client

1. Start your server: `npm run dev`
2. Test POST `/api/chat/message` in Postman
3. Connect a Socket.IO client with query param `userId`
4. The receiver will get real-time notifications via Socket.IO

### Example Socket.IO Client Code

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
    <script>
        const socket = io('http://localhost:3000', {
            query: { userId: 'user456' }
        });
        
        socket.on('newMessage', (message) => {
            console.log('New message received:', message);
        });
        
        socket.on('userOnline', (userId) => {
            console.log('User came online:', userId);
        });
    </script>
</body>
</html>
```
