const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    type: {
        type: String,
        required: true,
        enum: [
            'short_text', 'long_text', 'number', 'email', 'phone',
            'dropdown', 'radio', 'checkbox', 'image', 'file', 'date', 'time',
            'info_media'
        ]
    },
    label: { type: String, required: true },
    required: { type: Boolean, default: false },
    multiple: { type: Boolean, default: false },
    placeholder: { type: String },
    options: [{
        id: { type: String },
        label: { type: String },
        image: { type: String },
        isCorrect: { type: Boolean, default: false }
    }],
    mediaUrl: { type: String }, // For info_media type
    mediaType: { type: String, enum: ['image', 'file'] },
    validation: {
        minLength: { type: Number },
        maxLength: { type: Number },
        min: { type: Number },
        max: { type: Number },
        pattern: { type: String },
        allowedFormats: [String]
    },
    image: { type: String }, // Question image
    imageMessage: { type: String },
    showOtherInput: { type: Boolean, default: false }, // For dropdown "Other"
    logic: [{
        condition: {
            equals: String,
            notEquals: String,
        },
        action: {
            type: { type: String, enum: ['go_to_section', 'submit_form', 'show_question'] },
            targetId: String // Section ID or Question ID
        }
    }]
});

const sectionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String },
    description: { type: String },
    questions: [questionSchema]
});

const customFormSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    bannerImage: { type: String }, // Top banner image URL
    status: {
        type: String,
        enum: ['draft', 'published', 'closed'],
        default: 'draft'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sharedWith: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    settings: {
        collectEmail: { type: Boolean, default: false },
        allowMultipleResponses: { type: Boolean, default: true },
        showProgressBar: { type: Boolean, default: true },
        confirmationMessage: { type: String, default: 'Thank you for your response!' },
        isPublic: { type: Boolean, default: true },
        closeDate: { type: Date },
        isQuiz: { type: Boolean, default: false },
        showMarks: { type: Boolean, default: false }
    },
    sections: [sectionSchema], // Representing pages
}, {
    timestamps: true
});

module.exports = mongoose.model('CustomForm', customFormSchema);
