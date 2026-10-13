
import CartProductModel from "../models/cartproduct.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import mongoose from "mongoose";
import stripe from "../config/stripe.js";

// ==========================================
// CASH ON DELIVERY ORDER
// ==========================================
export async function CashOnDeliveryOrderController(req, res) {
    try {
        const userId = req.userId;
        const { list_items, totalAmt, addressId, subTotalAmt } = req.body;

        if (!userId || !list_items?.length || !addressId) {
            return res.status(400).json({
                message: "User, cart items and delivery address are required",
                success: false,
                error: true
            });
        }

        const payload = list_items.map((el) => ({
            userId,
            orderId: `ORD-${new mongoose.Types.ObjectId()}`,
            productId: el.productId._id,
            product_details: {
                name: el.productId.name,
                image: el.productId.image
            },
            paymentId: "",
            payment_status: "CASH ON DELIVERY",
            delivery_address: addressId,
            subTotalAmt,
            totalAmt
        }));

        const generatedOrder = await OrderModel.insertMany(payload);

        // Clear cart only after order is saved
        await CartProductModel.deleteMany({ userId });
        await UserModel.findByIdAndUpdate(userId, {
            $set: { shopping_cart: [] }
        });

        console.log("COD order created and cart cleared:", userId);

        return res.json({
            message: "Order successfully",
            error: false,
            success: true,
            data: generatedOrder
        });
    } catch (error) {
        console.error("COD order error:", error);

        return res.status(500).json({
            message: error.message || "Failed to create COD order",
            error: true,
            success: false
        });
    }
}

// ==========================================
// PRICE WITH DISCOUNT
// ==========================================
export const priceWithDiscount = (price, dis = 1) => {
    const discountAmount = Math.ceil(
        (Number(price) * Number(dis)) / 100
    );

    return Number(price) - discountAmount;
};

// ==========================================
// CREATE STRIPE CHECKOUT SESSION
// ==========================================
export async function paymentController(req, res) {
    try {
        const userId = req.userId;
        const { list_items, addressId } = req.body;

        if (!userId || !list_items?.length || !addressId) {
            return res.status(400).json({
                message: "User, cart items and delivery address are required",
                success: false,
                error: true
            });
        }

        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found",
                success: false,
                error: true
            });
        }

        const line_items = list_items.map((item) => {
            const product = item.productId;

            if (!product?._id || !product?.name || !product?.price) {
                throw new Error("Invalid product details in cart");
            }

            const price = priceWithDiscount(
                product.price,
                product.discount
            );

            return {
                price_data: {
                    currency: "inr",
                    product_data: {
                        name: product.name,
                        images: Array.isArray(product.image)
                            ? product.image.filter(Boolean).slice(0, 8)
                            : [],
                        metadata: {
                            productId: String(product._id)
                        }
                    },
                    unit_amount: Math.round(price * 100)
                },
                adjustable_quantity: {
                    enabled: true,
                    minimum: 1
                },
                quantity: Number(item.quantity) || 1
            };
        });

        const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, "");

        if (!frontendUrl) {
            throw new Error("FRONTEND_URL is missing in environment variables");
        }

        const session = await stripe.checkout.sessions.create({
            submit_type: "pay",
            mode: "payment",
            payment_method_types: ["card"],
            customer_email: user.email,
            metadata: {
                userId: String(userId),
                addressId: String(addressId)
            },
            line_items,
            success_url:
                `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendUrl}/cancel`
        });

        return res.status(200).json({
            url: session.url,
            success: true,
            error: false
        });
    } catch (error) {
        console.error("Stripe checkout creation error:", error);

        return res.status(500).json({
            message: error.message || "Unable to start payment",
            error: true,
            success: false
        });
    }
}

// ==========================================
// STRIPE WEBHOOK
// ==========================================
const endpointSecret = process.env.STRIPE_ENDPOINT_WEBHOOK_SECRET_KEY;

export async function webhookStripe(req, res) {
    let event;

    try {
        console.log("Stripe webhook received");

        if (!endpointSecret) {
            console.error("STRIPE_ENDPOINT_WEBHOOK_SECRET_KEY is missing");

            return res.status(500).send("Webhook secret is not configured");
        }

        const signature = req.headers["stripe-signature"];

        if (!signature) {
            return res.status(400).send("Missing Stripe signature");
        }

        // req.body must be the raw Buffer for signature verification
        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                signature,
                endpointSecret
            );
        } catch (error) {
            console.error("Stripe signature verification failed:", error.message);

            return res.status(400).send(
                `Webhook Error: ${error.message}`
            );
        }

        console.log("Stripe event:", event.type);

        // Ignore other Stripe events
        if (event.type !== "checkout.session.completed") {
            return res.status(200).json({
                received: true,
                ignored: true
            });
        }

        const session = event.data.object;

        // Do not create orders for unpaid sessions
        if (session.payment_status !== "paid") {
            console.log("Checkout session is not paid:", session.id);

            return res.status(200).json({
                received: true,
                skipped: "Payment not completed"
            });
        }

        const userId = session.metadata?.userId;
        const addressId = session.metadata?.addressId;

        if (
            !userId ||
            !addressId ||
            !mongoose.Types.ObjectId.isValid(userId) ||
            !mongoose.Types.ObjectId.isValid(addressId)
        ) {
            console.error("Missing or invalid checkout metadata", {
                sessionId: session.id,
                userId,
                addressId
            });

            return res.status(400).send("Missing or invalid checkout metadata");
        }

        // Check whether this payment has already generated orders.
        // Every item in the same checkout uses the same payment intent.
        const paymentId =
            typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id;

        if (!paymentId) {
            return res.status(400).send("Payment intent is missing");
        }

        const existingOrder = await OrderModel.findOne({
            userId,
            paymentId
        });

        if (existingOrder) {
            console.log("Orders already created for payment:", paymentId);

            // Retry cart cleanup in case an earlier attempt failed here.
            await CartProductModel.deleteMany({ userId });
            await UserModel.findByIdAndUpdate(userId, {
                $set: { shopping_cart: [] }
            });

            return res.status(200).json({
                received: true,
                message: "Order already exists; cart cleanup completed"
            });
        }

        // Retrieve the purchased items from Stripe
        const lineItems = await stripe.checkout.sessions.listLineItems(
            session.id,
            { expand: ["data.price.product"] }
        );

        if (!lineItems.data?.length) {
            throw new Error("No line items found for the checkout session");
        }

        const orderProduct = lineItems.data.map((item) => {
            const product = item.price?.product;

            if (!product || typeof product === "string") {
                throw new Error(
                    "Stripe product details were not expanded"
                );
            }

            const productId = product.metadata?.productId;

            if (!productId) {
                throw new Error(
                    `Product ID missing in Stripe metadata for ${product.name}`
                );
            }

            return {
                userId,
                orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                productId,
                product_details: {
                    name: product.name,
                    image: product.images || []
                },
                paymentId,
                payment_status: session.payment_status,
                delivery_address: addressId,
                subTotalAmt: Number(item.amount_subtotal / 100),
                totalAmt: Number(item.amount_total / 100)
            };
        });

        // Save orders before clearing the cart
        const savedOrders = await OrderModel.insertMany(orderProduct);

        console.log("Orders saved:", savedOrders.length);
        console.log("Clearing cart for user:", userId);

        const cartDelete = await CartProductModel.deleteMany({ userId });

        const userUpdate = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { shopping_cart: [] } },
            { new: true }
        );

        console.log("Cart products deleted:", cartDelete.deletedCount);
        console.log("User cart updated:", Boolean(userUpdate));

        return res.status(200).json({
            received: true,
            message: "Payment processed, orders saved and cart cleared"
        });
    } catch (error) {
        console.error("Stripe webhook processing error:", error);

        // Return a failure so Stripe can retry the webhook.
        return res.status(500).json({
            received: false,
            error: error.message || "Webhook processing failed"
        });
    }
}

// ==========================================
// GET USER ORDERS
// ==========================================
export async function getOrderDetailsController(req, res) {
    try {
        const userId = req.userId;

        const orderlist = await OrderModel.find({ userId })
            .sort({ createdAt: -1 })
            .populate("delivery_address");

        return res.json({
            message: "Order list",
            data: orderlist,
            error: false,
            success: true
        });
    } catch (error) {
        console.error("Get order details error:", error);

        return res.status(500).json({
            message: error.message || "Failed to get orders",
            error: true,
            success: false
        });
    }
}
