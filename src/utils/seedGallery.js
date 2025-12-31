const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Gallery = require('../models/Gallery');
const User = require('../models/User');
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

const categories = ['event', 'meeting', 'workshop', 'social', 'achievement', 'other'];
const specificKeywords = {
    event: ['concert', 'festival', 'stage', 'performance'],
    meeting: ['conference', 'meeting', 'presentation', 'office'],
    workshop: ['coding', 'workshop', 'classroom', 'robotics'],
    social: ['party', 'friends', 'laughing', 'students'],
    achievement: ['trophy', 'award', 'graduation', 'certificate'],
    other: ['campus', 'university', 'library', 'building']
};

const getRandomImg = (category) => {
    const keywords = specificKeywords[category];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    // Using loremflickr for reliable keyword-based images
    return `https://loremflickr.com/800/600/${keyword}?lock=${Math.floor(Math.random() * 10000)}`;
};

const seedGallery = async () => {
    await connectDB();

    try {
        // Find a user to assign as uploader
        const admin = await User.findOne({ role: 'admin' }) || await User.findOne({});

        if (!admin) {
            console.log('No user found to assign upload. Please create a user first.');
            process.exitAndSave(1);
        }

        console.log(`Assigning uploads to: ${admin.displayName} (${admin.role})`);

        const galleryItems = [];
        const TOTAL_IMAGES = 150;

        for (let i = 0; i < TOTAL_IMAGES; i++) {
            const category = categories[Math.floor(Math.random() * categories.length)];

            galleryItems.push({
                imageUrl: getRandomImg(category),
                publicId: `seed_img_${Date.now()}_${i}`, // Fake publicId
                title: `${category.charAt(0).toUpperCase() + category.slice(1)} Highlight #${i + 1}`,
                description: `A wonderful moment captured during our ${category} session.`,
                uploadedBy: admin._id,
                status: 'approved',
                approvedBy: admin._id,
                category: category,
                likes: [],
                comments: [],
                viewCount: Math.floor(Math.random() * 500)
            });
        }

        // Clear existing seed data if needed (optional, keeping safe for now by just appending)
        // await Gallery.deleteMany({ publicId: { $regex: 'seed_img_' } }); 

        await Gallery.insertMany(galleryItems);

        console.log(`Successfully added ${galleryItems.length} photos!`);
        process.exit(0);

    } catch (error) {
        console.error('Error seeding gallery:', error);
        process.exit(1);
    }
};

seedGallery();
