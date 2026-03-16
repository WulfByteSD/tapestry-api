import mongoose from 'mongoose';
import { AuthType } from '../../auth/model/Auth';

const UserSchema = new mongoose.Schema({}, { strict: false });

export default mongoose.model<AuthType>('Auth', UserSchema);
