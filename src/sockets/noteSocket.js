const Note = require('../models/Note');

module.exports = (io, socket) => {
    // Join a specific note room
    socket.on('note:join', async (noteId) => {
        socket.join(`note:${noteId}`);
        console.log(`📝 User ${socket.userId} joined note room: ${noteId}`);

        // Update collaborators in DB
        try {
            const note = await Note.findById(noteId);
            if (note) {
                // Remove existing entry for this user if any, then add fresh one
                await Note.findByIdAndUpdate(noteId, {
                    $pull: { collaborators: { userId: socket.userId } }
                });

                const updatedNote = await Note.findByIdAndUpdate(noteId, {
                    $addToSet: {
                        collaborators: {
                            userId: socket.userId,
                            lastActive: new Date()
                        }
                    }
                }, { new: true }).populate('collaborators.userId', 'displayName profilePicture');

                // Broadcast full list of active collaborators to the room
                const activeCollaborators = updatedNote.collaborators.map(c => ({
                    _id: c.userId?._id,
                    displayName: c.userId?.displayName,
                    profilePicture: c.userId?.profilePicture?.url || c.userId?.profilePicture
                }));

                io.to(`note:${noteId}`).emit('note:presence', {
                    noteId,
                    collaborators: activeCollaborators
                });
            }
        } catch (error) {
            console.error('Socket note:join error:', error);
        }
    });

    // Typing indicator
    socket.on('note:typing', (data) => {
        const { noteId, isTyping } = data;
        socket.to(`note:${noteId}`).emit('note:typing_update', {
            userId: socket.userId,
            isTyping,
            user: {
                _id: socket.userId,
                displayName: socket.userDisplayName,
                profilePicture: socket.userProfilePicture
            }
        });
    });

    // Leave note room
    socket.on('note:leave', async (noteId) => {
        socket.leave(`note:${noteId}`);
        console.log(`📝 User ${socket.userId} left note room: ${noteId}`);

        try {
            const updatedNote = await Note.findByIdAndUpdate(noteId, {
                $pull: { collaborators: { userId: socket.userId } }
            }, { new: true }).populate('collaborators.userId', 'displayName profilePicture');

            if (updatedNote) {
                const activeCollaborators = updatedNote.collaborators.map(c => ({
                    _id: c.userId?._id,
                    displayName: c.userId?.displayName,
                    profilePicture: c.userId?.profilePicture?.url || c.userId?.profilePicture
                }));

                io.to(`note:${noteId}`).emit('note:presence', {
                    noteId,
                    collaborators: activeCollaborators
                });
            }
        } catch (error) {
            console.error('Socket note:leave error:', error);
        }
    });

    // Operational Sync - Handles structured updates (Deltas/Blocks)
    socket.on('note:op', async (data) => {
        const { noteId, delta, selection, title, isPublic, clubId } = data;

        // Broadcast the operation to other collaborators
        socket.to(`note:${noteId}`).emit('note:op_received', {
            noteId,
            delta,
            selection,
            updatedBy: socket.userId,
            timestamp: Date.now()
        });

        // Also notify the club room for list updates if note is public
        if (isPublic && clubId && title) {
            io.to(clubId.toString()).emit('note:list_update', {
                type: 'update',
                noteId,
                title,
                content: data.plainTextSnippet || '', // Optional snippet for UI
                updatedAt: new Date()
            });
        }
    });

    // Cursor movement (relay only)
    socket.on('note:cursor', (data) => {
        const { noteId, cursor, selection } = data;
        socket.to(`note:${noteId}`).emit('note:cursor_move', {
            userId: socket.userId,
            displayName: socket.userDisplayName,
            profilePicture: socket.userProfilePicture,
            cursor,
            selection
        });
    });

    // Live update of content/styles - preserved for backward compatibility/initial load
    socket.on('note:update', async (data) => {
        const { noteId, content, contentDelta, styles, title, isPublic, clubId } = data;

        socket.to(`note:${noteId}`).emit('note:change', {
            content,
            contentDelta,
            styles,
            title,
            isPublic,
            updatedBy: socket.userId,
            timestamp: Date.now()
        });
    });

    // Handle sudden disconnect
    socket.on('disconnect', async () => {
        // Find all notes where this user was a collaborator and clean up
        try {
            const notes = await Note.find({ 'collaborators.userId': socket.userId });
            for (const note of notes) {
                const updatedNote = await Note.findByIdAndUpdate(note._id, {
                    $pull: { collaborators: { userId: socket.userId } }
                }, { new: true }).populate('collaborators.userId', 'displayName profilePicture');

                if (updatedNote) {
                    const activeCollaborators = updatedNote.collaborators.map(c => ({
                        _id: c.userId?._id,
                        displayName: c.userId?.displayName,
                        profilePicture: c.userId?.profilePicture?.url || c.userId?.profilePicture
                    }));

                    io.to(`note:${note._id}`).emit('note:presence', {
                        noteId: note._id,
                        collaborators: activeCollaborators
                    });
                }
            }
        } catch (err) {
            console.error('Socket disconnect cleanup error:', err);
        }
    });
};
