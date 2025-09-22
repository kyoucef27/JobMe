import "dotenv/config";
import express from 'express';
import cors from 'cors';
import userRoutes from './routes/user.routes';
import  {errorHandler}  from './middleware/errorHandler';
import cookieParser from 'cookie-parser';
import uploadRoutes from './routes/upload.routes'
import { createServer } from "http";
import chatRoutes from './routes/chat.routes';
import { initializeSocket } from './lib/socket';
const app = express();
export const server = createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5500", // Live Server default port
    "http://127.0.0.1:5500", // Live Server alternative
    "http://localhost:8080", // Alternative port
    "http://127.0.0.1:3000"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(cookieParser());
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/upload',uploadRoutes);
app.use('/api/chat', chatRoutes);

app.use(errorHandler);

export default app