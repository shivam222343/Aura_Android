const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getMessages,
    sendMessage,
    markAsRead,
    addReaction,
    deleteMessage,
    getConversations
} = require('../controllers/messageController');

const { uploadMedia, handleMulterError } = require('../middleware/upload');

router.use(protect);

router.get('/conversations/list', getConversations);
router.get('/:userId', getMessages);
router.post('/', uploadMedia.single('file'), handleMulterError, sendMessage);
router.put('/:userId/read', markAsRead);
router.post('/:messageId/reaction', addReaction);
router.delete('/:messageId', deleteMessage);

module.exports = router;
