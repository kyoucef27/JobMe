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
import aichatroutes from './routes/ai.routes'

import { sendOTP } from "./lib/otp";
import { verifyOTPAndCreateAccount } from "./controllers/verification.controller";

initializeSocket(server);


app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8080",
    "http://127.0.0.1:3000"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(cookieParser());
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/users', verifyOTPAndCreateAccount);
app.use('/api/upload',uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chatbot',aichatroutes)
app.use(errorHandler);

export default app