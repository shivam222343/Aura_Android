require('dotenv').config();
const mongoose = require('mongoose');

const fixIndex = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB.');

        const collection = mongoose.connection.collection('clubs');

        try {
            console.log('Attempting to drop accessKeys.key_1 index...');
            await collection.dropIndex('accessKeys.key_1');
            console.log('✅ SUCCESS: Index dropped.');
        } catch (error) {
            console.log('Index drop info:', error.message);
            // Try dropping just 'accessKeys.key' if named automatically differently
            try {
                // List indexes
                const indexes = await collection.indexes();
                console.log('Existing indexes:', indexes.map(i => i.name));
            } catch (e) {
                console.log('Could not list indexes');
            }
        }

    } catch (error) {
        console.error('❌ Script Error:', error.message);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        console.log('Done.');
        process.exit(0);
    }
};

fixIndex();
