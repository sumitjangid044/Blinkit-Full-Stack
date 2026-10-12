
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';

import connectDB from './config/connectDB.js';
import { webhookStripe } from './controllers/order.controller.js';

import userRouter from './route/user.route.js';
import categoryRouter from './route/category.route.js';
import uploadRouter from './route/upload.router.js';
import subCategoryRouter from './route/subCategory.route.js';
import productRouter from './route/product.route.js';
import cartRouter from './route/cart.route.js';
import addressRouter from './route/address.route.js';
import orderRouter from './route/order.route.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Allowed frontend URLs
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://blinkit-full-stack-pq73.vercel.app'
];

// CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.error('Blocked CORS origin:', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook must be before express.json()
app.post(
    '/api/order/webhook',
    express.raw({ type: 'application/json' }),
    webhookStripe
);

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

// Test route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Blinkit API is running'
    });
});

// API routes
app.use('/api/user', userRouter);
app.use('/api/category', categoryRouter);
app.use('/api/file', uploadRouter);
app.use('/api/subcategory', subCategoryRouter);
app.use('/api/product', productRouter);
app.use('/api/cart', cartRouter);
app.use('/api/address', addressRouter);
app.use('/api/order', orderRouter);

// Connect to MongoDB before handling requests.
// Cache the connection promise to avoid reconnecting unnecessarily.
let dbConnectionPromise;

async function ensureDBConnection() {
    if (!dbConnectionPromise) {
        dbConnectionPromise = connectDB().catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    await dbConnectionPromise;
}

// Local development server
if (!process.env.VERCEL) {
    ensureDBConnection()
        .then(() => {
            console.log('MongoDB connected successfully');

            app.listen(PORT, () => {
                console.log(`Server is running on port ${PORT}`);
            });
        })
        .catch((error) => {
            console.error('Database connection error:', error);
        });
}

// Vercel serverless handler
const vercelHandler = async (req, res) => {
    try {
        await ensureDBConnection();
        return app(req, res);
    } catch (error) {
        console.error('Database connection error:', error.message);

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Database connection failed'
            });
        }
    }
};

export default vercelHandler;
