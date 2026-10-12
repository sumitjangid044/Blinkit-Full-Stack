import mongoose from 'mongoose';

let connectionPromise;

async function connectDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing in environment variables');
    }

    // Reuse an existing connection
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // Avoid creating multiple connections for concurrent requests
    if (!connectionPromise) {
        connectionPromise = mongoose
            .connect(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 15000
            })
            .then(() => {
                console.log('MongoDB connected successfully');
                return mongoose.connection;
            })
            .catch((error) => {
                connectionPromise = null;
                console.error('MongoDB connection failed:', error.message);
                throw error;
            });
    }

    return connectionPromise;
}

export default connectDB;