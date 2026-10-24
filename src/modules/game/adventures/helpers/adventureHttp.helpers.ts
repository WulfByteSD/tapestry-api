import { Request } from 'express';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { AdventureActor } from '../types/adventure.contracts';

export function requestActor(req: Request): AdventureActor {
  const user = (req as any).user;
  if (!user?._id) throw new ErrorUtil('Authentication required', 401);
  return { userId: String(user._id), permissions: user.permissions || [] };
}
