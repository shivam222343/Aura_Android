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
    addReaction,
    votePoll,
    updateSpinner,
    getPollVoters,
    getMessageViewers
} = require('../controllers/groupChatController');

router.use(protect);

router.get('/:clubId', getGroupChat);
router.post('/:clubId/messages', upload.single('file'), sendGroupMessage);
router.post('/:clubId/messages-base64', sendBase64GroupMessage);
router.put('/:clubId/read', markGroupMessagesRead);
router.delete('/:clubId/messages/:messageId', deleteGroupMessage);
router.post('/:clubId/messages/:messageId/reaction', addReaction);
router.get('/:clubId/unread-count', getUnreadCount);
router.post('/:clubId/messages/:messageId/vote', votePoll);
router.put('/:clubId/messages/:messageId/spin', updateSpinner);
router.get('/:clubId/messages/:messageId/votes/:optionIndex', getPollVoters);
router.get('/:clubId/messages/:messageId/viewers', getMessageViewers);

module.exports = router;
