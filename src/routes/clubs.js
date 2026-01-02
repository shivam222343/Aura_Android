const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadImage, handleMulterError } = require('../middleware/upload');
const {
    getAllClubs,
    createClub,
    updateClub,
    addMemberToClub,
    getClubMembers,
    removeMemberFromClub,
    deleteClub
} = require('../controllers/clubController');

// Public/Member routes
router.get('/', protect, getAllClubs);
router.get('/:id/members', protect, getClubMembers);
router.put('/:id', protect, uploadImage.single('logo'), handleMulterError, updateClub);

// Admin routes
router.post('/', protect, authorize('admin'), uploadImage.single('logo'), handleMulterError, createClub);
router.post('/add-member', protect, authorize('admin'), addMemberToClub);
router.post('/remove-member', protect, authorize('admin'), removeMemberFromClub);
router.delete('/:id', protect, authorize('admin'), deleteClub);

module.exports = router;
