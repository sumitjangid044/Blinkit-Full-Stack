
import CartProductModel from "../models/cartproduct.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import mongoose from "mongoose";
import stripe from "../config/stripe.js";



export async function CashOnDeliveryOrderController(req, res) {
    try {
        const userId = req.userId // auth middleware 
        const { list_items, totalAmt, addressId, subTotalAmt } = req.body

        const payload = list_items.map(el => {
            return ({
                userId: userId,
                orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                productId: el.productId._id,
                product_details: {
                    name: el.productId.name,
                    image: el.productId.image
                },
                paymentId: "",
                payment_status: "CASH ON DELIVERY",
                delivery_address: addressId,
                subTotalAmt: subTotalAmt,
                totalAmt: totalAmt,
            })
        })
        const generatedOrder = await OrderModel.insertMany(payload)

        ///remove from the cart
        const removeCartItems = await CartProductModel.deleteMany({ userId: userId })
        const updateInUser = await UserModel.updateOne({ _id: userId }, { shopping_cart: [] })

        return res.json({
            message: "Order successfully",
            error: false,
            success: true,
            data: generatedOrder
        })


    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }

}

export const priceWithDiscount = (price, dis = 1) => {
    const discountAmount = Math.ceil((Number(price) * Number(dis)) / 100)
    const actualPrice = Number(price) - Number(discountAmount)
    return actualPrice
}

export async function paymentController(req, res) {
    try {
        const userId = req.userId // auth middleware 
        const { list_items, addressId } = req.body

        const user = await UserModel.findById(userId)

        const line_items = list_items.map(item => {
            return {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: item.productId.name,
                        images: item.productId.image,
                        metadata: {
                            productId: item.productId._id
                        }
                    },
                    unit_amount: priceWithDiscount(item.productId.price, item.productId.discount) * 100
                },
                adjustable_quantity: {
                    enabled: true,
                    minimum: 1
                },
                quantity: item.quantity
            }
        })

        const params = {
            submit_type: 'pay',
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: user.email,
            metadata: {
                userId: userId,
                addressId: addressId
            },
            line_items: line_items,
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cancel`
        }

        const session = await stripe.checkout.sessions.create(params)

        res.status(200).json({ url: session.url });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}


const getOrderProductItems = async ({
    lineItems,
    userId,
    addressId,
    paymentId,
    payment_status,
}) => {
    const productList = []

    if (lineItems?.data?.length) {
        for (const item of lineItems.data) {
            const product = await stripe.products.retrieve(item.price.product)

            const payload = {
                userId: userId,
                orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                productId: product.metadata.productId,
                product_details: {
                    name: product.name,
                    image: product.images
                },
                paymentId: paymentId,
                payment_status: payment_status,
                delivery_address: addressId,
                subTotalAmt: Number(item.amount_total / 100),
                totalAmt: Number(item.amount_total / 100),
            }

            productList.push(payload)
        }
    }

    return productList
}


const endpointSecret = process.env.STRIPE_ENDPOINT_WEBHOOK_SECRET_KEY;

//http://localhost:8080/api/order/webhook
export const webhookStripe = async (req, res) => {
    try {
        console.log("⚡ [1] Stripe webhook route HIT");

        const sig = req.headers["stripe-signature"];
        let event;

        try {
            // ✅ Verify Stripe signature
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                endpointSecret
            );
            console.log("✅ [2] Stripe signature verified!");
        } catch (err) {
            console.error("❌ [2] Signature verification failed:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        const importantEvents = ["checkout.session.completed"];
        if (!importantEvents.includes(event.type)) {
            return res.status(200).send(`Ignored event: ${event.type}`);
        }

        console.log("📦 [3] Event type:", event.type);

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            console.log("💰 [4] Payment successful for session:", session.id);

            try {
                // ✅ Fetch all line items for this session
                const lineItems = await stripe.checkout.sessions.listLineItems(
                    session.id,
                    { expand: ["data.price.product"] }
                );

                console.log("🧾 Line items fetched:", lineItems.data.length);

                const userId = session.metadata?.userId;
                const addressId = session.metadata?.addressId;

                if (!userId || !addressId) {
                    console.error("❌ Missing metadata (userId or addressId)");
                    return res.status(400).send("Missing metadata");
                }

                // 🧩 Build order documents
                const orderProduct = lineItems.data.map((item) => {
                    const product = item.price.product;
                    return {
                        userId,
                        orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                        productId: product.metadata.productId,
                        product_details: {
                            name: product.name,
                            image: product.images,
                        },
                        paymentId: session.payment_intent,
                        payment_status: session.payment_status,
                        delivery_address: addressId,
                        subTotalAmt: Number(item.amount_total / 100),
                        totalAmt: Number(item.amount_total / 100),
                    };
                });

                // 💾 Save to MongoDB
                const order = await OrderModel.insertMany(orderProduct);
                console.log("🛒 [5] Orders saved:", order.length);

                // 🧹 Clear user's cart
                await UserModel.findByIdAndUpdate(userId, { shopping_cart: [] });
                await CartProductModel.deleteMany({ userId });
                console.log("🧹 [6] User cart cleared!");
            } catch (err) {
                console.error("❌ Failed to fetch session line items:", err.message);
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error("❌ [Webhook Error]:", error.message);
        res.status(500).json({ error: true, message: error.message });
    }
};

export async function getOrderDetailsController(request,response){
    try {
        const userId = request.userId // order id

        const orderlist = await OrderModel.find({ userId : userId }).sort({ createdAt : -1 }).populate('delivery_address')

        return response.json({
            message : "order list",
            data : orderlist,
            error : false,
            success : true
        })
    } catch (error) {
        return response.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}




