import { Server } from "socket.io";
import {server} from "../app"
import { Router } from "express";

const router = Router();

const io = new Server(server, {
  // options
});

io.on("connection", (socket) => {
  // ...

});





export default router;