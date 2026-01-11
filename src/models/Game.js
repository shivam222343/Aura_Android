const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    posterUrl: String,
    thumbnailUrl: String,
    players: String,
    tag: String,
    color: String,
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Game', GameSchema);
