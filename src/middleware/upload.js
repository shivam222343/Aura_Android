const multer = require('multer');
const path = require('path');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
};

// Media filter (Images & Videos)
const mediaFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|wmv|flv|mkv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        console.log('File rejected by mediaFilter:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            ext: path.extname(file.originalname).toLowerCase()
        });
        cb(new Error(`Invalid file type (${file.mimetype}). Only images and videos are allowed.`));
    }
};

const uploadImage = multer({
    storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit for images
    },
    fileFilter: imageFilter
});

const uploadMedia = multer({
    storage,
    limits: {
        fileSize: 200 * 1024 * 1024, // 200MB limit for media
    },
    fileFilter: mediaFilter
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size is too large. Maximum size is 20MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message
        });
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next();
};

module.exports = {
    upload,
    uploadImage,
    uploadMedia,
    handleMulterError
};
