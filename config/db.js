const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // यहाँ process.env.MONGO_URI होना बेहद ज़रूरी है!
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      socketTimeoutMS: 45000, // 45 second socket timeout
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.log('⚠️  MongoDB connection failed, but continuing in development mode');
    console.log('⚠️  Some features may not work without database connection');
    
    // Don't exit process in development
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;