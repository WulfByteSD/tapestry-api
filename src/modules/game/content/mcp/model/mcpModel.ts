import mongoose, { Schema } from 'mongoose';

/** Use isolated collections and reject unexpected persistence fields. */
export const options = (collection: string) => ({ timestamps: true, collection, strict: 'throw' as const });
/** Reuse registered models during tests and hot reload. */
export const model = (name: string, schema: Schema): mongoose.Model<any> => mongoose.models[name] || mongoose.model(name, schema);
