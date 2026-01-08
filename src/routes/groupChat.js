const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
    getGroupChat,
    sendGroupMessage,
    sendBase64GroupMessage,
    markGroupMessagesRead,
    deleteGroupMessage,
    getUnreadCount,
    addReaction
} = require('../controllers/groupChatController');

router.use(protect);

router.get('/:clubId', getGroupChat);
router.post('/:clubId/messages', upload.single('file'), sendGroupMessage);
router.post('/:clubId/messages-base64', sendBase64GroupMessage);
router.put('/:clubId/read', markGroupMessagesRead);
router.delete('/:clubId/messages/:messageId', deleteGroupMessage);
router.post('/:clubId/messages/:messageId/reaction', addReaction);
router.get('/:clubId/unread-count', getUnreadCount);

module.exports = router;
