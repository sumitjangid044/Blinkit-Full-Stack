import dotenv from "dotenv";
dotenv.config();

import connectDB from "./config/connectDB.js";
import CategoryModel from "./models/category.model.js";

const categories = [
    { name: "Atta, Rice & Dal" },
    { name: "Baby Care" },
    { name: "Bakery & Biscuits" },
    { name: "Breakfast & Instant Food" },
    { name: "Chicken, Meat & Fish" },
    { name: "Cleaning Essentials" },
    { name: "Cold Drinks & Juices" },
    { name: "Dairy, Bread & Eggs" },
    { name: "Fruits & Vegetables" },
    { name: "Home & Office" },
    { name: "Masala, Oil & More" },
    { name: "Organic & Healthy Living" },
    { name: "Paan Corner" },
    { name: "Personal Care" },
    { name: "Pet Care" },
    { name: "Pharma & Wellness" },
    { name: "Sauces & Spreads" },
    { name: "Snacks & Munchies" },
    { name: "Sweet Tooth" },
    { name: "Tea, Coffee & Health Drink" }
];

const seed = async () => {
    try {
        await connectDB();

        await CategoryModel.deleteMany({});

        await CategoryModel.insertMany(categories);

        console.log("✅ Categories restored");

        process.exit();

    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}

seed();