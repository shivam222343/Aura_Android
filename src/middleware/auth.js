const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // Check for token in headers or query params
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.query.token) {
            token = req.query.token;
        }

        // Make sure token exists
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from token
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Server error in authentication'
        });
    }
};

/**
 * Authorize specific roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};

/**
 * Check if user is admin or subadmin of a specific club
 */
const authorizeClubAdmin = async (req, res, next) => {
    try {
        const clubId = req.params.clubId || req.body.clubId;

        if (!clubId) {
            return res.status(400).json({
                success: false,
                message: 'Club ID is required'
            });
        }

        const userClub = req.user.clubsJoined.find(
            club => club.clubId.toString() === clubId &&
                (club.role === 'admin' || club.role === 'alumni')
        );

        if (!userClub) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to perform this action in this club'
            });
        }

        req.clubRole = userClub.role;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Server error in club authorization'
        });
    }
};

module.exports = {
    protect,
    authorize,
    authorizeClubAdmin
};
