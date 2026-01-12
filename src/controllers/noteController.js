const Note = require('../models/Note');

/**
 * @desc    Create a new note
 * @route   POST /api/notes
 * @access  Private
 */
exports.createNote = async (req, res) => {
    try {
        const { title, content, clubId, isPublic, styles } = req.body;

        const note = await Note.create({
            userId: req.user._id,
            clubId: clubId || null,
            title: title || 'Untitled Note',
            content: content || '',
            isPublic: isPublic || false,
            styles: styles || {},
            lastModifiedBy: req.user._id
        });

        // Broadcast to club if public
        if (note.isPublic && note.clubId) {
            const io = req.app.get('io');
            if (io) {
                io.to(note.clubId.toString()).emit('note:list_update', {
                    type: 'create',
                    note: {
                        ...note.toObject(),
                        userId: {
                            _id: req.user._id,
                            displayName: req.user.displayName,
                            profilePicture: req.user.profilePicture
                        }
                    }
                });
            }
        }

        res.status(201).json({
            success: true,
            data: note
        });
    } catch (error) {
        console.error('Create note error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating note'
        });
    }
};

/**
 * @desc    Get all accessible notes
 * @route   GET /api/notes
 * @access  Private
 */
exports.getNotes = async (req, res) => {
    try {
        const { clubId } = req.query;

        // Find my personal notes OR public notes in this club
        const query = {
            $or: [
                { userId: req.user._id },
                { clubId, isPublic: true }
            ]
        };

        const notes = await Note.find(query)
            .populate('userId', 'displayName profilePicture')
            .populate('lastModifiedBy', 'displayName')
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            data: notes
        });
    } catch (error) {
        console.error('Get notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notes'
        });
    }
};

/**
 * @desc    Get a single note
 * @route   GET /api/notes/:id
 * @access  Private
 */
exports.getNoteById = async (req, res) => {
    try {
        const note = await Note.findById(req.params.id)
            .populate('userId', 'displayName profilePicture')
            .populate('collaborators.userId', 'displayName profilePicture');

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Check permission
        if (!note.isPublic && note.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        res.status(200).json({
            success: true,
            data: note
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching note' });
    }
};

/**
 * @desc    Update a note
 * @route   PUT /api/notes/:id
 * @access  Private
 */
exports.updateNote = async (req, res) => {
    try {
        const { title, content, styles, isPublic } = req.body;

        let note = await Note.findById(req.params.id);

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        // Check permission: Owner can update anything, Collaborators (club members) can update content if public
        const isOwner = note.userId.toString() === req.user._id.toString();
        const canUpdate = isOwner || note.isPublic;

        if (!canUpdate) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this note' });
        }

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (styles !== undefined) updateData.styles = styles;
        if (isPublic !== undefined && isOwner) updateData.isPublic = isPublic;

        updateData.lastModifiedBy = req.user._id;

        note = await Note.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        }).populate('userId', 'displayName profilePicture');

        // Broadcast list updates if it's public or was public
        if (note.clubId) {
            const io = req.app.get('io');
            if (io) {
                if (note.isPublic) {
                    // Send update or create (if it just became public)
                    io.to(note.clubId.toString()).emit('note:list_update', {
                        type: 'create', // Use 'create' to ensure it appears in lists of others
                        note: note
                    });
                } else {
                    // It became personal, remove from others' lists
                    io.to(note.clubId.toString()).emit('note:list_update', {
                        type: 'delete',
                        noteId: note._id
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            data: note
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating note' });
    }
};

/**
 * @desc    Delete a note
 * @route   DELETE /api/notes/:id
 * @access  Private (Owner Only)
 */
exports.deleteNote = async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found' });
        }

        if (note.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only the owner can delete this note' });
        }

        const clubId = note.clubId;
        const isPublic = note.isPublic;
        const noteId = note._id;

        await note.deleteOne();

        // Broadcast to club room if it was public
        if (isPublic && clubId) {
            const io = req.app.get('io');
            if (io) {
                io.to(clubId.toString()).emit('note:list_update', {
                    type: 'delete',
                    noteId: noteId
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Note deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting note' });
    }
};
