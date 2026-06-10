import mongoose from "mongoose";

export interface IResourceAccessGrant extends mongoose.Document {
  userId: string;
  resourceId: string;

  permissions: Array<'view' | 'download'>;

  source: {
    type:
      | 'purchase'
      | 'claim'
      | 'promotion'
      | 'admin'
      | 'subscription';

    sourceId?: string;
    productId?: string;
    orderId?: string;
  };

  status: 'active' | 'revoked' | 'expired';

  grantedAt: Date;
  expiresAt?: Date;
}

const ResourceAccessGrantSchema = new mongoose.Schema<IResourceAccessGrant>({
  userId: { type: String, required: true },
  resourceId: { type: String, required: true },
  permissions: [{ type: String, enum: ['view', 'download'], required: true }],
  source: {
    type: {
      type: String,
      enum: ['purchase', 'claim', 'promotion', 'admin', 'subscription'],
      required: true,
    },
    sourceId: { type: String },
    productId: { type: String },
    orderId: { type: String },
  },
  status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
  grantedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

export default mongoose.model<IResourceAccessGrant>('ResourceAccessGrant', ResourceAccessGrantSchema);