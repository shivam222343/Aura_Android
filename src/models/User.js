const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // Don't return password by default
    },
    displayName: {
        type: String,
        required: [true, 'Please provide a display name'],
        trim: true,
    },
    maverickId: {
        type: String,
        unique: true,
        index: true,
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    fullName: {
        type: String,
        trim: true
    },
    birthDate: {
        type: Date
    },
    branch: {
        type: String,
        trim: true
    },
    passoutYear: {
        type: String,
        trim: true
    },
    profilePicture: {
        url: String,
        publicId: String
    },
    role: {
        type: String,
        enum: ['admin', 'alumni', 'member', 'user'],
        default: 'user'
    },
    clubsJoined: [{
        clubId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Club'
        },
        role: {
            type: String,
            enum: ['admin', 'alumni', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        consecutiveAbsences: {
            type: Number,
            default: 0
        }
    }],
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    fcmToken: {
        type: String // For push notifications
    },
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        },
        sidebarBanner: {
            type: String, // URL of selected banner
            default: null
        },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            meetings: { type: Boolean, default: true },
            tasks: { type: Boolean, default: true }
        }
    },
    stats: {
        totalMeetingsAttended: {
            type: Number,
            default: 0
        },
        approvedAbsences: {
            type: Number,
            default: 0
        },
        unauthorizedAbsences: {
            type: Number,
            default: 0
        }
    },
    profilePictureHistory: [{
        url: String,
        publicId: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Pre-save middleware to generate Maverick ID and hash password
userSchema.pre('save', async function (next) {
    // Generate Maverick ID for new users
    if (this.isNew && !this.maverickId) {
        // Generate unique 8-character ID (e.g., MAV-A1B2C3D4)
        const generateMaverickId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = 'MAV-';
            for (let i = 0; i < 8; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        };

        // Ensure uniqueness
        let isUnique = false;
        while (!isUnique) {
            this.maverickId = generateMaverickId();
            const existing = await this.constructor.findOne({ maverickId: this.maverickId });
            if (!existing) isUnique = true;
        }
    }

    // Hash password if modified
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Method to get public profile
userSchema.methods.getPublicProfile = function () {
    const user = this.toObject();
    delete user.password;
    return user;
};

module.exports = mongoose.model('User', userSchema);
