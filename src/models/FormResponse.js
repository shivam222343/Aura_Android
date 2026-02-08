const mongoose = require('mongoose');

const formResponseSchema = new mongoose.Schema({
    formId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomForm',
        required: true
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    email: { type: String }, // If collectEmail is true and user is anonymous
    answers: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    isQuiz: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    totalPossibleScore: { type: Number, default: 0 },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('FormResponse', formResponseSchema);
