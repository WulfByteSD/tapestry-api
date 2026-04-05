import jwt, { JwtPayload } from 'jsonwebtoken';
import { Socket } from 'socket.io';
import User from '../modules/auth/model/Auth';
import PlayerModel from '../modules/profiles/player/model/PlayerModel';

/**
 * Socket.io middleware — verifies JWT from socket.handshake.auth.token
 * and attaches user/player identity to socket.data.
 */
export const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded.userId).select('-password').lean();

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    const player = await PlayerModel.findOne({ user: user._id as any }).lean();
    if (!player) {
      return next(new Error('Player profile not found'));
    }

    socket.data.userId = (user._id as any).toString();
    socket.data.playerId = (player._id as any).toString();
    socket.data.displayName = player.displayName || 'Unknown';
    socket.data.avatar = player.avatar ?? null;

    next();
  } catch {
    next(new Error('Invalid token'));
  }
};
