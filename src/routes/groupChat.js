const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMedia, handleMulterError } = require('../middleware/upload');
const {
    getGroupChat,
    sendGroupMessage,
    markGroupMessagesRead,
    deleteGroupMessage,
    updateGroupSettings,
    addGroupReaction,
    getGroupsUnreadCount
} = require('../controllers/groupChatController');

// All routes require authentication
router.use(protect);

// Get total unread count for all groups
router.get('/unread/total', getGroupsUnreadCount);

// Get group chat for a club
router.get('/:clubId', getGroupChat);

// Update group settings (Name, Icon)
router.put('/:clubId/settings', uploadMedia.single('file'), handleMulterError, updateGroupSettings);

// Send message to group chat (with optional file upload)
router.post('/:clubId/messages', uploadMedia.single('file'), handleMulterError, sendGroupMessage);

// Reaction to message
router.post('/:clubId/messages/:messageId/reaction', addGroupReaction);

// Mark messages as read
router.put('/:clubId/read', markGroupMessagesRead);

// Delete message
router.delete('/:clubId/messages/:messageId', deleteGroupMessage);

module.exports = router;
