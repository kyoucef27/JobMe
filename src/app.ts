import "dotenv/config";
import express from 'express';
import userRoutes from './routes/user.routes';
import  {errorHandler}  from './middleware/errorHandler';
import cookieParser from 'cookie-parser';
import uploadRoutes from './routes/upload.routes'
import { createServer } from "http";
import chatRoutes from './routes/chat.routes'


const app = express();
export const server = createServer(app);



app.use(cookieParser());
app.use(express.json());


app.use('/api/users', userRoutes);
app.use('/api/upload',uploadRoutes);
app.use('/chat', chatRoutes);



app.use(errorHandler);

export default app