const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    createEvent,
    getAllEvents,
    getEventById,
    updateEvent,
    deleteEvent
} = require('../controllers/eventController');

router.use(protect);

router.route('/')
    .get(getAllEvents)
    .post(authorize('admin'), createEvent);

router.route('/:id')
    .get(getEventById)
    .put(authorize('admin'), updateEvent)
    .delete(authorize('admin'), deleteEvent);

module.exports = router;
