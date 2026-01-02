const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const {
    getGroupChat,
    sendGroupMessage,
    markGroupMessagesRead,
    deleteGroupMessage,
    getUnreadCount
} = require('../controllers/groupChatController');

router.use(protect);

router.get('/:clubId', getGroupChat);
router.post('/:clubId/messages', upload.single('file'), sendGroupMessage);
router.put('/:clubId/read', markGroupMessagesRead);
router.delete('/:clubId/messages/:messageId', deleteGroupMessage);
router.get('/:clubId/unread-count', getUnreadCount);

module.exports = router;
