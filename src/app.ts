import "dotenv/config";
import express from 'express';
import cors from 'cors';
import userRoutes from './routes/user.routes';
import  {errorHandler}  from './middleware/errorHandler';
import cookieParser from 'cookie-parser';
import uploadRoutes from './routes/upload.routes'
import { createServer } from "http";
import chatRoutes from './routes/chat.routes';
import gigRoutes from './routes/gig.routes'
import orderRoutes from './routes/order.routes'
import simplegigRoutes from './routes/simplegig.routes'
import simpleorderRoutes from './routes/simpleorder.routes'
import { initializeSocket } from './lib/socket';
const app = express();
export const server = createServer(app);
import aichatroutes from './routes/ai.routes'
import { verifyOTPAndCreateAccount } from "./controllers/verification.controller";
import { PendingUser } from "./models/sessiondata.model";
import session from 'express-session'

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
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  }
}));
app.use(cookieParser());
app.use(express.json());



app.use('/api/users', userRoutes);
app.use('/api/users', verifyOTPAndCreateAccount);
app.use('/api/upload',uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chatbot',aichatroutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/simplegigs', simplegigRoutes);
app.use('/api/simpleorders', simpleorderRoutes);
app.use(errorHandler);

export default app