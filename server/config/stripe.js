import Stripe from "stripe"
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
});
// const endpointSecret = process.env.STRIPE_ENDPOINT_WEBHOOK_SECRET_KEY;

export default stripe