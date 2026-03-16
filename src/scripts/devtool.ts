import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ModelKey, ModelMap } from '../utils/ModelMap';

// Add other models as needed

dotenv.config();

/**
 * Development Tool Script
 * Use this script for database maintenance, testing, and debugging
 *
 * Usage: npm run devtool
 *
 * Add your custom logic in the main() function below
 */

class DevTool {
  private isConnected = false;
  private modelMap: Record<ModelKey, mongoose.Model<any>> = ModelMap;
  /**
   * Connect to MongoDB database
   */
  async connect(): Promise<void> {
    try {
      if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI environment variable is not set');
      }

      await mongoose.connect(process.env.MONGO_URI);
      this.isConnected = true;
      console.info('🔗 Connected to MongoDB');
      console.info(`📊 Database: ${mongoose.connection.name}`);
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB database
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await mongoose.disconnect();
      console.info('🔌 Disconnected from MongoDB');
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<void> {
    console.info('\n📈 Database Statistics:');
    console.info('------------------------');

    try { 
      // Add more stats as needed
      console.info('------------------------\n');
    } catch (error) {
      console.error('❌ Error getting stats:', error);
    }
  }

  /**
   * ===================================
   * ADD YOUR CUSTOM LOGIC BELOW
   * ===================================
   */
  async customTask(): Promise<void> {
    console.info('🛠️  Running custom task...');
    try {
    } catch (error) {
      console.info('❌ Error in custom task:', error);
    }

    console.info('\n✅ Custom task completed');
  }

  /**
   * Main execution function
   * Customize this to run whatever tasks you need
   */
  async main(): Promise<void> {
    console.info('🚀 DevTool Starting...\n');

    try {
      // Connect to database
      await this.connect();

      // Get basic stats
      await this.getStats();

      // Run custom task
      await this.customTask();
    } catch (error) {
      console.error('❌ DevTool error:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
      console.info('🏁 DevTool completed');
    }
  }
}

// Execute the devtool
const devTool = new DevTool();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.info('\n⚠️  Received SIGINT, shutting down gracefully...');
  await devTool.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.info('\n⚠️  Received SIGTERM, shutting down gracefully...');
  await devTool.disconnect();
  process.exit(0);
});

// Run the tool
devTool.main().catch(console.error);
