import { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from './socketAuth';
import { registerPresenceHandlers } from './presence/presenceHandlers';

const colors = require('colors');

/**
 * @description Socket connection, this file is called from server.js and is used to handle socket connections and disconnections
 *              We can import other socket files here to handle socket events and emit socket events from here
 * @param {Object} io - Socket.io instance
 * @returns {void}
 *
 * @author Austin Howard
 * @since 1.0
 * @version 1.0
 */
export default (io: Server) => {
  // Authenticate every socket connection via JWT
  io.use(socketAuthMiddleware);

  try {
    io.on('connection', (socket: Socket) => {
      // ── Legacy handlers ────────────────────────────────────────────────
      socket.on('setup', (userData: object) => {});
      socket.on('disconnect', () => {});
      socket.on('join', async (room: { roomId: string; user: any }) => {
        if (!room.roomId) return;
        socket.join(room.roomId);
      });
      socket.on('leave', async (room: { roomId: string; user: string }) => {
        console.info(colors.yellow(`${room.user} has left the room`) + colors.blue(` ${room.roomId}`));
        socket.leave(room.roomId);
      });
      socket.on('sendNewMessage', (room: any) => {
        // send the new message to the client
        socket.broadcast.to(room.roomId).emit('newMessage', room.message);
      });

      // ── Presence handlers ──────────────────────────────────────────────
      registerPresenceHandlers(io, socket);
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};
