const mongoose = require('mongoose');
const colors = require('colors');

/**
 * Build MongoDB connection URI from individual components
 */
export const buildMongoURI = (): string => {
  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASS;
  const cluster = process.env.CLUSTER_STRING;
  const dbName = process.env.MONGO_DBNAME; 
  // Use provided credentials or fallback to local development
  if (user && pass && cluster) {
    return `mongodb+srv://${user}:${pass}@${cluster}/?retryWrites=true&w=majority&appName=Cluster0`;
  }

  // Fallback to local MongoDB for development
  console.warn(`MongoDB credentials not fully set, using local MongoDB: mongodb://localhost:27017/${dbName || 'tapestry-api'}`);
  return `mongodb://localhost:27017/${dbName || 'tapestry-api'}`;
};

export const MONGO_URI = buildMongoURI();

export default async () => {
  try {
    const uri = await MONGO_URI;
    console.log(`Attempting to connect to: ${uri.replace(/:[^/]*@/, ':****@')}`); // Hide password in logs

    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DBNAME,
    });
    console.info(colors.bgGreen.white('MongoDB Connected'));
  } catch (error: any) {
    console.error(colors.bgRed.white('MongoDB Connection Error:'));
    console.error(`Code: ${error.code}`);
    console.error(`Message: ${error.message}`);
    if (error.reason) console.error(`Reason: ${error.reason}`);
    process.exit(1);
  }
};
