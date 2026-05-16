import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import helmet from 'helmet'

import connectDB from './config/connectDB.js'
import { webhookStripe } from './controllers/order.controller.js'

import userRouter from './route/user.route.js'
import categoryRouter from './route/category.route.js'
import uploadRouter from './route/upload.router.js'
import subCategoryRouter from './route/subCategory.route.js'
import productRouter from './route/product.route.js'
import cartRouter from './route/cart.route.js'
import addressRouter from './route/address.route.js'
import orderRouter from './route/order.route.js'

const app = express()

const PORT = process.env.PORT || 8080

// Allowed frontend URLs
const allowedOrigins = [
    "http://localhost:5173",
    "https://blinkit-full-stack-pq73.vercel.app"
]

// CORS
app.use(cors({
    origin: function(origin, callback){
        if(!origin || allowedOrigins.includes(origin)){
            callback(null, true)
        } else {
            callback(new Error("Not allowed by CORS"))
        }
    },
    credentials: true,
    methods: ["GET","POST","PUT","DELETE","PATCH","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"]
}))

// Stripe webhook (must come before express.json)
app.post(
    "/api/order/webhook",
    express.raw({ type: "application/json" }),
    webhookStripe
)

// Middlewares
app.use(express.json())
app.use(cookieParser())
app.use(morgan("dev"))
app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
)

// Test route
app.get("/", (req, res) => {
    res.json({
        message: `✅ Server running on port ${PORT}`
    })
})

// Routes
app.use("/api/user", userRouter)
app.use("/api/category", categoryRouter)
app.use("/api/file", uploadRouter)
app.use("/api/subcategory", subCategoryRouter)
app.use("/api/product", productRouter)
app.use("/api/cart", cartRouter)
app.use("/api/address", addressRouter)
app.use("/api/order", orderRouter)

// DB + Server
connectDB()
.then(() => {
    console.log("connect DB")

    app.listen(PORT, () => {
        console.log(`✅ Server is running on port ${PORT}`)
    })
})
.catch((err)=>{
    console.log("Database connection error:",err)
})