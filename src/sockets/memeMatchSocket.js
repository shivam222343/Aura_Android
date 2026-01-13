// Meme Match Game Socket Handler

// Situation database
const SITUATIONS = [
    // Work/Office (10)
    "When you realize it's Monday tomorrow",
    "When your boss asks if you can work this weekend",
    "When you accidentally reply all to a company email",
    "When the meeting could have been an email",
    "When you're pretending to work but scrolling social media",
    "When someone takes credit for your idea",
    "When the WiFi goes down during an important presentation",
    "When you see your coworker eating your lunch from the fridge",
    "When you get a meeting invite for 5pm on Friday",
    "When you're asked to explain what you do at family gatherings",

    // School/College (10)
    "When the teacher says 'this will be on the test'",
    "When you studied the wrong chapter for the exam",
    "When the professor extends the deadline",
    "When you realize the assignment is due in 1 hour",
    "When someone asks to copy your homework",
    "When the group project member finally replies",
    "When you're called on and weren't paying attention",
    "When the cafeteria runs out of your favorite food",
    "When you see your exam results",
    "When you're trying to reach the word count on an essay",

    // Relationships (10)
    "When they text 'we need to talk'",
    "When you're introduced to your partner's parents",
    "When you see your ex with someone new",
    "When they say 'I'm fine' but they're clearly not",
    "When you're waiting for a text back",
    "When you accidentally like their old photo while stalking",
    "When they remember something you mentioned once",
    "When you're trying to act cool but you're nervous",
    "When they ask 'what are you thinking about?'",
    "When you realize you're catching feelings",

    // Technology (10)
    "When your phone battery dies at 1%",
    "When you can't find your phone and it's on silent",
    "When autocorrect changes your message to something weird",
    "When you're trying to take a selfie in public",
    "When the video buffers at the best part",
    "When you accidentally open the front camera",
    "When you delete something important by mistake",
    "When your earphones get tangled in your pocket",
    "When you're waiting for a download to finish",
    "When someone calls instead of texting",

    // Random/Absurd (10)
    "When you're home alone and hear a noise",
    "When you wave back at someone who wasn't waving at you",
    "When you're trying to be quiet but everything is loud",
    "When you realize you've been talking to yourself",
    "When you're pretending to understand something",
    "When you see someone you know in public and hide",
    "When you're walking and forget how to walk normally",
    "When you're laughing at your own joke",
    "When you're trying to remember why you entered a room",
    "When you realize everyone can see your screen"
];

function getRandomSituation() {
    return SITUATIONS[Math.floor(Math.random() * SITUATIONS.length)];
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Exported functions
let _io;
let _gameRooms;
let _broadcastRoomList;

const handlers = {
    initDeps: (io, gameRooms, broadcastRoomList) => {
        _io = io;
        _gameRooms = gameRooms;
        _broadcastRoomList = broadcastRoomList;
    },
    startMemeMatchGame: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        // Initialize game state
        room.state = {
            currentRound: 0,
            players: room.players.map(p => ({ ...p, score: 0, turnScore: 0 })),
            submissions: [],
            votes: {},
            phase: 'waiting'
        };

        // Start first round
        handlers.startNextMemeMatchRound(io, roomId, gameRooms);
    },

    startNextMemeMatchRound: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        const situation = getRandomSituation();

        room.state.currentRound = (room.state.currentRound || 0) + 1;
        room.state.situation = situation;
        room.state.submissions = [];
        room.state.votes = {};
        room.state.phase = 'submitting';
        room.state.timeRemaining = 60;
        room.state.votingStarted = false;

        io.to(roomId).emit('memematch:situation', {
            round: room.state.currentRound,
            totalRounds: room.config.totalRounds,
            situation,
            timeLimit: 60
        });

        // We need access to the internal startTimer function. 
        // Since we are decoupling, we might need to expose it or duplicate the timer logic.
        // For simplicity in this architecture, we will rely on a new timer starter or move the timer logic here.
        // However, the timer uses setInterval which needs to be stored on room.state.

        // Let's define the timer logic helper inside handlers to be used by both
        handlers.startMemeMatchTimer(io, roomId, gameRooms, 'submitting');
    },

    startMemeMatchTimer: (io, roomId, gameRooms, phase) => {
        const room = gameRooms[roomId];
        if (!room) return;

        if (room.state.timer) {
            clearInterval(room.state.timer);
        }

        const timeLimit = phase === 'submitting' ? 60 : 30;
        room.state.timeRemaining = timeLimit;

        room.state.timer = setInterval(() => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom) {
                clearInterval(room.state.timer);
                return;
            }

            currentRoom.state.timeRemaining--;
            io.to(roomId).emit('memematch:time_update', currentRoom.state.timeRemaining);

            if (currentRoom.state.timeRemaining <= 0) {
                clearInterval(currentRoom.state.timer);

                if (phase === 'submitting') {
                    handlers.startVotingPhase(io, roomId, gameRooms);
                } else if (phase === 'voting') {
                    handlers.endMemeMatchRound(io, roomId, gameRooms);
                }
            }
        }, 1000);
    },

    checkMemePhaseCompletion: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room || !room.state) return;

        if (room.state.phase === 'submitting') {
            if (room.state.submissions.length >= room.players.length && room.players.length >= 2) {
                console.log(`🏎️ Round ${room.state.currentRound}: All ${room.players.length} players submitted. Starting voting early.`);
                if (room.state.timer) {
                    clearInterval(room.state.timer);
                    room.state.timer = null;
                }
                handlers.startVotingPhase(io, roomId, gameRooms);
            }
        } else if (room.state.phase === 'voting') {
            const votedCount = Object.keys(room.state.votes || {}).length;
            if (votedCount >= room.players.length && room.players.length >= 2) {
                console.log(`🏎️ Round ${room.state.currentRound}: All ${room.players.length} players voted. Ending round early.`);
                if (room.state.timer) {
                    clearInterval(room.state.timer);
                    room.state.timer = null;
                }
                handlers.endMemeMatchRound(io, roomId, gameRooms);
            }
        }
    },


    startVotingPhase: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        room.state.phase = 'voting';
        room.state.votingStarted = true;

        const shuffledSubmissions = shuffleArray(room.state.submissions).map(s => ({
            submissionId: s.submissionId,
            caption: s.caption
        }));

        io.to(roomId).emit('memematch:voting_start', {
            submissions: shuffledSubmissions,
            timeLimit: 30
        });

        handlers.startMemeMatchTimer(io, roomId, gameRooms, 'voting');
    },

    endMemeMatchRound: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        if (room.state.timer) {
            clearInterval(room.state.timer);
            room.state.timer = null;
        }

        room.state.phase = 'results';

        room.state.submissions.forEach(submission => {
            const player = room.players.find(p => p.userId === submission.userId);
            if (player) {
                const voteCount = (submission.votes || []).length;
                const points = voteCount * 100;

                const maxVotes = Math.max(...room.state.submissions.map(s => (s.votes || []).length));
                if (voteCount === maxVotes && maxVotes > 0) {
                    player.score += points + 500;
                    player.turnScore = points + 500;
                } else {
                    player.score += points;
                    player.turnScore = points;
                }
                player.score += 50;
            }
        });

        const sortedSubmissions = [...room.state.submissions].sort((a, b) =>
            (b.votes || []).length - (a.votes || []).length
        );

        io.to(roomId).emit('memematch:round_end', {
            submissions: sortedSubmissions.map(s => ({
                ...s,
                voteCount: (s.votes || []).length
            })),
            scores: room.players.map(p => ({
                userId: p.userId,
                userName: p.userName,
                score: p.score,
                turnScore: p.turnScore || 0
            })).sort((a, b) => b.score - a.score)
        });

        setTimeout(() => {
            const stillExists = gameRooms[roomId];
            if (stillExists) {
                if (stillExists.state.currentRound >= stillExists.config.totalRounds) {
                    handlers.endMemeMatchGame(io, roomId, gameRooms);
                } else {
                    stillExists.players.forEach(p => { p.turnScore = 0; });
                    handlers.startNextMemeMatchRound(io, roomId, gameRooms);
                }
            }
        }, 8000);
    },

    endMemeMatchGame: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        room.status = 'finished';
        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

        io.to(roomId).emit('memematch:game_over', {
            winner: sortedPlayers[0],
            leaderboard: sortedPlayers
        });

        setTimeout(() => {
            delete gameRooms[roomId];
        }, 60000);
    },

    init: (io, socket, gameRooms) => {
        // Listeners
        socket.on('memematch:join', (data) => {
            const { roomId } = data;
            const room = gameRooms[roomId];
            if (room) {
                socket.join(roomId);
                socket.emit('game:update', room);
                console.log(`Player joined Meme Match room: ${roomId}`);
            }
        });

        // Keep start_round listener for legacy or manual triggers, but it uses the handler
        socket.on('memematch:start_round', (data) => {
            const { roomId } = data;
            handlers.startNextMemeMatchRound(io, roomId, gameRooms);
        });

        socket.on('memematch:submit', (data) => {
            const { roomId, userId, userName, caption } = data;
            const room = gameRooms[roomId];

            if (!room || room.state.phase !== 'submitting') return;

            const existingSubmission = room.state.submissions.find(s => s.userId === userId);
            if (existingSubmission) {
                existingSubmission.caption = caption;
            } else {
                room.state.submissions.push({
                    submissionId: `sub_${Date.now()}_${userId}`,
                    userId,
                    userName,
                    caption,
                    votes: []
                });
            }

            io.to(roomId).emit('memematch:submission_count', {
                submitted: room.state.submissions.length,
                total: room.players.length
            });

            if (room.state.submissions.length === room.players.length) {
                handlers.checkMemePhaseCompletion(io, roomId, gameRooms);
            }
        });

        socket.on('memematch:vote', (data) => {
            const { roomId, userId, submissionId } = data;
            const room = gameRooms[roomId];

            if (!room || room.state.phase !== 'voting') return;

            const submission = room.state.submissions.find(s => s.submissionId === submissionId);
            if (submission && submission.userId === userId) return;

            room.state.votes[userId] = submissionId;

            const targetSubmission = room.state.submissions.find(s => s.submissionId === submissionId);
            if (targetSubmission && !targetSubmission.votes.includes(userId)) {
                targetSubmission.votes.push(userId);
            }

            io.to(roomId).emit('memematch:vote_count', {
                voted: Object.keys(room.state.votes).length,
                total: room.players.length
            });

            // Always check for completion after a vote is recorded
            handlers.checkMemePhaseCompletion(io, roomId, gameRooms);
        });

        socket.on('memematch:leave', (roomId) => {
            const room = gameRooms[roomId];
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                socket.leave(roomId);
                if (room.players.length === 0) {
                    if (room.state.timer) clearInterval(room.state.timer);
                    delete gameRooms[roomId];
                } else {
                    io.to(roomId).emit('memematch:player_left', {
                        players: room.players
                    });
                    // Check if phase should complete now that total count decreased
                    handlers.checkMemePhaseCompletion(io, roomId, gameRooms);
                }

                // Broadcast updated room list
                if (_broadcastRoomList) {
                    _broadcastRoomList(io, room.clubId, room.gameType);
                }
            }
        });
    }
};

module.exports = handlers;
