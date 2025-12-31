const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Gallery = require('../models/Gallery');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const cleanupGallery = async () => {
    await connectDB();

    try {
        // Delete images with the specific seed pattern we used
        const result = await Gallery.deleteMany({ publicId: { $regex: '^seed_img_' } });

        console.log(`Successfully removed ${result.deletedCount} seed images from Gallery.`);
        process.exit(0);
    } catch (error) {
        console.error('Error cleaning up gallery:', error);
        process.exit(1);
    }
};

cleanupGallery();
