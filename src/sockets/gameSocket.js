const User = require('../models/User');
const codeBreakerHandler = require('./codeBreakerSocket');
const memeMatchHandler = require('./memeMatchSocket');

const gameRooms = {}; // In-memory storage for active game rooms

module.exports = (io, socket) => {
    // 🎲 Get Active Rooms for a Club
    socket.on('games:get_rooms', (data) => {
        const { clubId, gameType } = data;
        const activeRooms = Object.values(gameRooms).filter(r => {
            const clubMatch = clubId === 'all' || r.clubId === clubId || r.clubId === 'all';
            return clubMatch && r.gameType === gameType && r.status === 'lobby';
        });
        socket.emit('games:rooms_list', { rooms: activeRooms, gameType });
    });

    // 🚀 Host a Game
    socket.on('games:host', async (data) => {
        const { clubId, gameType, userId, userName, totalRounds = 3 } = data;
        const roomId = `room_${Date.now()}`;

        gameRooms[roomId] = {
            roomId,
            clubId,
            gameType,
            hostId: userId,
            hostName: userName,
            players: [{
                userId,
                userName,
                score: 0,
                isReady: true,
                socketId: socket.id
            }],
            status: 'lobby',
            createdAt: new Date(),
            config: {
                totalRounds: parseInt(totalRounds) || 3,
                roundTime: 90, // 90 seconds per round
            },
            state: {
                currentRound: 0,
                currentTurnIndex: 0, // Track which player's turn
                timeRemaining: 0,
                currentDrawer: null,
                currentWord: '',
                wordOptions: [], // Two word choices for drawer
                hint: '', // Progressive hint
                paths: [], // Drawing paths
                guesses: [], // Recent guesses with status
                correctGuessers: [], // Users who guessed correctly this round
                canvasColor: '#FFFFFF' // Canvas background color
            }
        };

        socket.join(roomId);
        socket.emit('games:host_success', roomId);
        io.to(roomId).emit('game:update', gameRooms[roomId]);

        // Broadcast updated room list to all users
        broadcastRoomList(io, clubId, gameType);

        console.log(`🎮 User ${userName} hosted ${gameType} in room ${roomId} (${totalRounds} rounds)`);

        // 📢 Send Chaotic Notification to Club Members
        const chaoticMessages = [
            `🎨 ${userName} just started Sketch Heads! Join or be square! 🟦🏃‍♂️`,
            `🚨 CODE RED: ${userName} is drawing! Witness the disaster! 🖌️🔥`,
            `🫣 ${userName} hosted a game. This is gonna be a trainwreck. Get in here! 🤪`,
            `✏️ Sketch Heads time! ${userName} thinks they are Picasso. Spoiler: They aren't. 😂💀`,
            `🔥 ${userName} challenges YOU to a draw-off! Don't chicken out! 🐔🚀`
        ];
        const randomMsg = chaoticMessages[Math.floor(Math.random() * chaoticMessages.length)];

        // Emit to club room (Frontend must ensure users join this room when entering club)
        io.to(`club:${clubId}`).emit('notification:game_hosted', {
            title: 'New Game Hosted! 🎮',
            message: randomMsg,
            hostName: userName,
            roomId,
            gameType
        });

        // 📝 Save Persistent Notification to Database and Trigger Refresh
        try {
            const Notification = require('../models/Notification');
            const { sendClubPushNotification } = require('../utils/pushNotifications');

            // Find all club members except host
            const members = await User.find({
                'clubsJoined.clubId': clubId,
                _id: { $ne: userId }
            });

            const notifications = members.map(m => ({
                userId: m._id,
                type: 'game_hosted',
                title: 'New Game Hosted! 🎮',
                message: randomMsg,
                clubId: clubId,
                data: {
                    screen: 'MaverickGames',
                    params: {
                        autoOpenLobby: true,
                        roomId,
                        gameType
                    }
                },
                priority: 'medium'
            }));

            if (notifications.length > 0) {
                await Notification.insertMany(notifications);

                // Signal each member to refresh their notification count via their personal room
                members.forEach(m => {
                    io.to(m._id.toString()).emit('notification_receive', {});
                });

                // Send External Push Notifications
                await sendClubPushNotification(
                    clubId,
                    'New Game Hosted! 🎮',
                    randomMsg,
                    {
                        screen: 'MaverickGames',
                        params: {
                            autoOpenLobby: true,
                            roomId,
                            gameType
                        },
                        senderId: userId
                    }
                );
            }
        } catch (error) {
            console.error('❌ Error saving game hosted notification:', error);
        }
    });

    // 🤝 Join a Game
    socket.on('games:join', (data) => {
        const { roomId, userId, userName } = data;
        const room = gameRooms[roomId];

        if (room && room.status === 'lobby' && room.players.length < 8) {
            const alreadyIn = room.players.find(p => p.userId === userId);
            if (!alreadyIn) {
                room.players.push({
                    userId,
                    userName,
                    score: 0,
                    isReady: true,
                    socketId: socket.id
                });
            }
            socket.join(roomId);
            io.to(roomId).emit('game:update', room);

            // Broadcast updated room list
            broadcastRoomList(io, room.clubId, room.gameType);

            console.log(`👤 User ${userName} joined game room ${roomId}`);
        } else {
            socket.emit('game:error', { message: 'Room full or already started' });
        }
    });

    // 🏁 Start Game (Host only)
    socket.on('games:start', (data) => {
        const { roomId, userId } = data;
        const room = gameRooms[roomId];

        console.log(`🎮 Start game request from ${userId} for room ${roomId}`);

        if (room && room.hostId === userId) {
            if (room.players.length < 2) {
                socket.emit('game:error', { message: 'Need at least 2 players to start' });
                return;
            }

            console.log(`✅ Starting game in room ${roomId} with ${room.players.length} players`);

            room.status = 'playing';

            // Shuffle players for random turn order
            room.players = shuffleArray(room.players);

            // Broadcast updated state immediately
            io.to(roomId).emit('game:update', room);

            // Start the first round based on game type
            if (room.gameType === 'code_breaker') {
                codeBreakerHandler.startCodeBreakerGame(io, roomId, gameRooms);
            } else if (room.gameType === 'meme_match') {
                memeMatchHandler.startMemeMatchGame(io, roomId, gameRooms);
            } else {
                startNextRound(io, roomId);
            }

            // Remove from lobby list
            broadcastRoomList(io, room.clubId, room.gameType);
        } else {
            console.log(`❌ Failed to start game: room=${!!room}, isHost=${room?.hostId === userId}`);
        }
    });

    // 🎯 Select Word (Drawer chooses from 2 options)
    socket.on('game:select_word', (data) => {
        const { roomId, word } = data;
        const room = gameRooms[roomId];
        if (!room || room.status !== 'playing') return;

        room.state.currentWord = word;
        room.state.hint = generateInitialHint(word);

        // Notify all players that word was selected and game is starting
        io.to(roomId).emit('game:word_selected', {
            hint: room.state.hint,
            wordLength: word.length
        });

        // Start the round timer
        startRoundTimer(io, roomId);
    });

    // ✏️ Drawing Sync
    socket.on('game:draw', (data) => {
        const { roomId, path } = data;
        const room = gameRooms[roomId];
        if (room && room.status === 'playing') {
            room.state.paths.push(path);
            socket.to(roomId).emit('game:draw_update', path);
        }
    });

    // 🧹 Clear Canvas
    socket.on('game:clear_canvas', (data) => {
        const { roomId } = data;
        const room = gameRooms[roomId];
        if (room) {
            room.state.paths = [];
            io.to(roomId).emit('game:canvas_cleared');
        }
    });

    // 🎨 Canvas Color Change
    socket.on('game:change_canvas_color', (data) => {
        const { roomId, color } = data;
        const room = gameRooms[roomId];
        if (room) {
            room.state.canvasColor = color;
            io.to(roomId).emit('game:canvas_color_update', { color });
        }
    });

    // 🔄 Sync Paths (Undo/Redo)
    socket.on('game:sync_paths', (data) => {
        const { roomId, paths } = data;
        const room = gameRooms[roomId];
        if (room) {
            room.state.paths = paths || [];
            // Broadcast to everyone including sender to ensure state is perfectly synced
            io.to(roomId).emit('game:paths_synced', { paths: room.state.paths });
        }
    });

    // 💡 Guess Word
    socket.on('game:guess', (data) => {
        const { roomId, userId, userName, guess } = data;
        const room = gameRooms[roomId];
        if (!room || room.status !== 'playing') return;

        // Don't allow drawer to guess
        if (userId === room.state.currentDrawer) return;

        const normalizedGuess = guess.trim().toLowerCase();
        const normalizedWord = room.state.currentWord.toLowerCase();

        const isCorrect = normalizedGuess === normalizedWord;

        // Check if already guessed correctly
        const alreadyGuessed = room.state.correctGuessers.includes(userId);

        if (isCorrect && !alreadyGuessed) {
            // Correct Guess!
            const player = room.players.find(p => p.userId === userId);
            if (player) {
                // Award points based on time remaining
                const points = Math.max(10, Math.floor(room.state.timeRemaining * 1.5));
                player.score += points;
                player.turnScore = (player.turnScore || 0) + points;
                room.state.correctGuessers.push(userId);

                // Add to guess feed
                room.state.guesses.unshift({
                    userId,
                    userName,
                    isCorrect: true,
                    points,
                    timestamp: Date.now()
                });

                // Keep only last 5 guesses
                room.state.guesses = room.state.guesses.slice(0, 5);

                io.to(roomId).emit('game:guess_update', {
                    guesses: room.state.guesses,
                    correctCount: room.state.correctGuessers.length
                });

                // Drawer also gets points
                const drawer = room.players.find(p => p.userId === room.state.currentDrawer);
                if (drawer) {
                    drawer.score += 5;
                    drawer.turnScore = (drawer.turnScore || 0) + 5;
                }

                // If everyone guessed, end round early
                const guessersCount = room.players.length - 1;
                if (room.state.correctGuessers.length >= guessersCount) {
                    endRound(io, roomId);
                }
            }
        } else if (!isCorrect) {
            // Wrong guess - add to feed
            room.state.guesses.unshift({
                userId,
                userName,
                isCorrect: false,
                timestamp: Date.now()
            });

            room.state.guesses = room.state.guesses.slice(0, 5);

            io.to(roomId).emit('game:guess_update', {
                guesses: room.state.guesses,
                correctCount: room.state.correctGuessers.length
            });
        }
    });

    // 🚪 Leave Game
    socket.on('games:leave', (roomId) => {
        const room = gameRooms[roomId];
        if (room) {
            room.players = room.players.filter(p => p.socketId !== socket.id);
            socket.leave(roomId);

            if (room.players.length === 0) {
                console.log(`🧹 Empty room ${roomId} deleted after user left`);
                delete gameRooms[roomId];
            } else {
                if (room.hostId === socket.userId) {
                    const newHost = room.players[0];
                    room.hostId = newHost.userId;
                    room.hostName = newHost.userName;
                    console.log(`👑 New host assigned to room ${roomId}: ${room.hostName}`);
                }
                io.to(roomId).emit('game:update', room);
            }

            broadcastRoomList(io, room.clubId, room.gameType);
        }
    });

    // ⚠️ Cleanup on Disconnect
    socket.on('disconnect', () => {
        Object.keys(gameRooms).forEach(roomId => {
            const room = gameRooms[roomId];
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

            if (playerIndex !== -1) {
                const leavingPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);

                console.log(`🔌 User ${leavingPlayer.userName} disconnected from room ${roomId}`);

                if (room.players.length === 0) {
                    console.log(`🧹 Empty room ${roomId} deleted after disconnect`);
                    delete gameRooms[roomId];
                } else {
                    if (room.hostId === leavingPlayer.userId) {
                        const newHost = room.players[0];
                        room.hostId = newHost.userId;
                        room.hostName = newHost.userName;
                    }
                    io.to(roomId).emit('game:update', room);
                }
                broadcastRoomList(io, room.clubId, room.gameType);
            }
        });
    });

    // 🔐 Register Code Breaker handler
    codeBreakerHandler.init(io, socket, gameRooms);

    // 😂 Register Meme Match handler
    memeMatchHandler.init(io, socket, gameRooms);
};

// 🔄 Game Loop Logic
const WORDS = [
    // Animals (25)
    'Elephant', 'Dragon', 'Butterfly', 'Penguin', 'Giraffe', 'Octopus', 'Kangaroo', 'Dolphin', 'Tiger', 'Peacock',
    'Crocodile', 'Flamingo', 'Koala', 'Panda', 'Zebra', 'Cheetah', 'Gorilla', 'Owl', 'Parrot', 'Seahorse',
    'Jellyfish', 'Chameleon', 'Hedgehog', 'Platypus', 'Sloth',

    // Objects & Technology (30)
    'Laptop', 'Guitar', 'Camera', 'Diamond', 'Rocket', 'Robot', 'Bicycle', 'Telescope', 'Microphone', 'Headphones',
    'Keyboard', 'Smartphone', 'Drone', 'Compass', 'Hourglass', 'Umbrella', 'Backpack', 'Suitcase', 'Hammer', 'Scissors',
    'Paintbrush', 'Flashlight', 'Binoculars', 'Calculator', 'Trophy', 'Crown', 'Sword', 'Shield', 'Anchor', 'Telescope',

    // Nature & Weather (25)
    'Sunset', 'Mountain', 'Rainbow', 'Thunder', 'Ocean', 'Forest', 'Volcano', 'Waterfall', 'Lightning', 'Tornado',
    'Snowflake', 'Avalanche', 'Eclipse', 'Aurora', 'Comet', 'Meteor', 'Island', 'Canyon', 'Desert', 'Glacier',
    'Meadow', 'Jungle', 'Reef', 'Cave', 'Cliff',

    // Food & Drinks (25)
    'Pizza', 'Hamburger', 'Sushi', 'Taco', 'Donut', 'Cupcake', 'Sandwich', 'Pancake', 'Waffle', 'Burrito',
    'Croissant', 'Pretzel', 'Popcorn', 'Milkshake', 'Smoothie', 'Lemonade', 'Espresso', 'Spaghetti', 'Ramen', 'Dumpling',
    'Cheesecake', 'Brownie', 'Macaron', 'Tiramisu', 'Lasagna',

    // Buildings & Places (20)
    'Castle', 'Pyramid', 'Lighthouse', 'Windmill', 'Skyscraper', 'Cathedral', 'Temple', 'Observatory', 'Stadium', 'Museum',
    'Library', 'Hospital', 'Airport', 'Bridge', 'Fountain', 'Statue', 'Monument', 'Pagoda', 'Mansion', 'Cottage',

    // Sports & Games (20)
    'Basketball', 'Football', 'Tennis', 'Baseball', 'Volleyball', 'Bowling', 'Archery', 'Fencing', 'Surfing', 'Skateboard',
    'Snowboard', 'Parachute', 'Trampoline', 'Darts', 'Billiards', 'Badminton', 'Cricket', 'Hockey', 'Golf', 'Wrestling',

    // Professions (15)
    'Wizard', 'Astronaut', 'Detective', 'Firefighter', 'Scientist', 'Artist', 'Musician', 'Chef', 'Pilot', 'Surgeon',
    'Architect', 'Engineer', 'Photographer', 'Magician', 'Ninja',

    // Vehicles & Transportation (15)
    'Helicopter', 'Submarine', 'Spaceship', 'Motorcycle', 'Sailboat', 'Hovercraft', 'Ambulance', 'Firetruck', 'Bulldozer',
    'Tractor', 'Scooter', 'Skateboard', 'Rollerblades', 'Jetpack', 'Balloon',

    // Actions & Activities (15)
    'Dancing', 'Singing', 'Jumping', 'Swimming', 'Climbing', 'Painting', 'Reading', 'Writing', 'Cooking', 'Gardening',
    'Fishing', 'Camping', 'Hiking', 'Meditation', 'Yoga',

    // Abstract & Emotions (10)
    'Happiness', 'Surprise', 'Confusion', 'Excitement', 'Curiosity', 'Dream', 'Nightmare', 'Victory', 'Celebration', 'Mystery'
];

function startNextRound(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) {
        console.log(`❌ startNextRound: Room ${roomId} not found`);
        return;
    }

    room.state.currentRound++;
    console.log(`📍 Round ${room.state.currentRound}/${room.config.totalRounds} starting in room ${roomId}`);

    // Check if all rounds completed
    if (room.state.currentRound > room.config.totalRounds) {
        console.log(`🏁 All rounds complete (${room.state.currentRound - 1}/${room.config.totalRounds}), triggering gameOver`);
        gameOver(io, roomId);
        return;
    }

    // Always reset turn index when a new round starts
    room.state.currentTurnIndex = 0;

    startNextTurn(io, roomId);
}

function startNextTurn(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) {
        console.log(`❌ startNextTurn: Room ${roomId} not found`);
        return;
    }

    // Reset turn scores for all players at the beginning of each turn
    room.players.forEach(p => { p.turnScore = 0; });

    // Check if round is complete (everyone had a turn)
    if (room.state.currentTurnIndex >= room.players.length) {
        console.log(`✅ Round ${room.state.currentRound} turns complete, proceeding to next round check`);
        startNextRound(io, roomId);
        return;
    }

    // Assign current drawer
    const drawer = room.players[room.state.currentTurnIndex];
    if (!drawer) {
        console.log(`❌ startNextTurn: No drawer found at index ${room.state.currentTurnIndex}`);
        startNextRound(io, roomId);
        return;
    }

    // Reset turn state
    room.state.timeRemaining = 0;
    room.state.currentDrawer = drawer.userId;
    room.state.currentWord = '';
    room.state.paths = [];
    room.state.guesses = [];
    room.state.correctGuessers = [];
    room.state.hint = '';
    room.state.canvasColor = '#FFFFFF';

    // Generate 2 random word options
    const shuffled = shuffleArray([...WORDS]);
    room.state.wordOptions = [shuffled[0], shuffled[1]];

    console.log(`🎨 Turn ${room.state.currentTurnIndex + 1}/${room.players.length} (Round ${room.state.currentRound}): ${drawer.userName} is drawing`);

    io.to(roomId).emit('game:turn_start', {
        round: room.state.currentRound,
        turn: room.state.currentTurnIndex + 1,
        totalTurns: room.players.length,
        drawerId: drawer.userId,
        drawerName: drawer.userName
    });

    // Send word options ONLY to drawer
    io.to(drawer.socketId).emit('game:word_options', {
        options: room.state.wordOptions
    });

    // Increment turn index for the NEXT call
    room.state.currentTurnIndex++;
}

function startRoundTimer(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    // Clear any existing timer just in case
    if (room.state.timer) {
        clearInterval(room.state.timer);
    }

    room.state.timeRemaining = room.config.roundTime;

    const hintInterval = Math.floor(room.config.roundTime / Math.max(1, room.state.currentWord.length));
    let lastHintTime = room.state.timeRemaining;
    let allRevealed = false;

    room.state.timer = setInterval(() => {
        const currentRoom = gameRooms[roomId];
        if (!currentRoom || currentRoom.status !== 'playing') {
            clearInterval(currentRoom?.state?.timer);
            return;
        }

        currentRoom.state.timeRemaining--;
        io.to(roomId).emit('game:time_update', currentRoom.state.timeRemaining);

        // Reveal all letters when 10 seconds remain
        if (currentRoom.state.timeRemaining === 10 && !allRevealed) {
            currentRoom.state.hint = currentRoom.state.currentWord.split('').join(' ');
            io.to(roomId).emit('game:hint_update', currentRoom.state.hint);
            allRevealed = true;
        }
        // Reveal hint character progressively
        else if (currentRoom.state.timeRemaining > 10 && currentRoom.state.timeRemaining <= lastHintTime - hintInterval) {
            currentRoom.state.hint = revealNextCharacter(currentRoom.state.currentWord, currentRoom.state.hint);
            io.to(roomId).emit('game:hint_update', currentRoom.state.hint);
            lastHintTime = currentRoom.state.timeRemaining;
        }

        if (currentRoom.state.timeRemaining <= 0) {
            clearInterval(currentRoom.state.timer);
            currentRoom.state.timer = null;
            endTurn(io, roomId);
        }
    }, 1000);
}

function endTurn(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    // CRITICAL: Clear timer to prevent multiple endTurn calls
    if (room.state.timer) {
        clearInterval(room.state.timer);
        room.state.timer = null;
    }

    io.to(roomId).emit('game:turn_end', {
        word: room.state.currentWord,
        scores: room.players.map(p => ({
            userId: p.userId,
            userName: p.userName,
            score: p.score,
            turnScore: p.turnScore || 0
        })).sort((a, b) => b.score - a.score)
    });

    // Wait 5 seconds before next turn
    setTimeout(() => {
        const stillExists = gameRooms[roomId];
        if (stillExists && stillExists.status === 'playing') {
            startNextTurn(io, roomId);
        }
    }, 5000);
}

function endRound(io, roomId) {
    const room = gameRooms[roomId];
    if (room && room.state.timer) {
        clearInterval(room.state.timer);
        room.state.timer = null;
    }
    endTurn(io, roomId);
}

function gameOver(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    room.status = 'finished';
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

    io.to(roomId).emit('game:over', {
        winner: sortedPlayers[0],
        leaderboard: sortedPlayers
    });

    // Delete room after 1 minute
    setTimeout(() => {
        delete gameRooms[roomId];
    }, 60000);
}

// Helper Functions
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateInitialHint(word) {
    return word.split('').map(() => '_').join(' ');
}

function revealNextCharacter(word, currentHint) {
    const hintArray = currentHint.split(' ');
    const hiddenIndices = hintArray.map((char, idx) => char === '_' ? idx : -1).filter(idx => idx !== -1);

    if (hiddenIndices.length > 0) {
        const randomIndex = hiddenIndices[Math.floor(Math.random() * hiddenIndices.length)];
        hintArray[randomIndex] = word[randomIndex];
    }

    return hintArray.join(' ');
}

function broadcastRoomList(io, clubId, gameType) {
    // Rooms to show for this specific club
    const clubRooms = Object.values(gameRooms).filter(r =>
        (r.clubId === clubId || r.clubId === 'all') &&
        r.gameType === gameType &&
        r.status === 'lobby'
    );

    if (clubId !== 'all') {
        io.to(`club:${clubId}`).emit('games:rooms_list', { rooms: clubRooms, gameType });
    }

    // Rooms to show for 'all'
    const allRooms = Object.values(gameRooms).filter(r =>
        r.gameType === gameType &&
        r.status === 'lobby'
    );
    io.to('club:all').emit('games:rooms_list', { rooms: allRooms, gameType });
}
