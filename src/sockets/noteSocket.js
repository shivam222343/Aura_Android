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

                await Note.findByIdAndUpdate(noteId, {
                    $addToSet: {
                        collaborators: {
                            userId: socket.userId,
                            lastActive: new Date()
                        }
                    }
                });

                // Notify others in the note room
                socket.to(`note:${noteId}`).emit('note:user_joined', {
                    userId: socket.userId,
                    user: {
                        _id: socket.userId,
                        displayName: socket.userDisplayName, // Assumes these are on socket
                        profilePicture: socket.userProfilePicture
                    }
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
            await Note.findByIdAndUpdate(noteId, {
                $pull: { collaborators: { userId: socket.userId } }
            });

            socket.to(`note:${noteId}`).emit('note:user_left', {
                userId: socket.userId
            });
        } catch (error) {
            console.error('Socket note:leave error:', error);
        }
    });

    // Live update of content/styles
    socket.on('note:update', async (data) => {
        const { noteId, content, styles, title, isPublic, clubId } = data;

        // Broadcast to everyone else in the note room
        socket.to(`note:${noteId}`).emit('note:change', {
            content,
            styles,
            title,
            isPublic,
            updatedBy: socket.userId
        });

        // Also notify the club room for list updates if note is public
        if (isPublic && clubId) {
            io.to(clubId.toString()).emit('note:list_update', {
                type: 'update',
                noteId,
                title,
                content: content ? content.substring(0, 100) : '',
                updatedAt: new Date()
            });
        }
    });

    // Cursor movement
    socket.on('note:cursor', (data) => {
        const { noteId, cursor } = data;
        socket.to(`note:${noteId}`).emit('note:cursor_move', {
            userId: socket.userId,
            cursor
        });
    });
};
