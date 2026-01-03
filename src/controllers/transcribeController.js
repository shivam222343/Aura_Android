const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * @desc    Transcribe audio to text
 * @route   POST /api/ai/transcribe
 * @access  Private
 */
exports.transcribeAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No audio file provided' });
        }

        console.log(`[AI] Transcribing audio: ${req.file.originalname} (${req.file.size} bytes)`);

        // Groq Whisper expects a file. Since we have a buffer from multer, we might need to write to temp file
        // or check if groq-sdk supports buffers.
        // Actually, groq-sdk's transcriptions.create usually takes a file stream.

        const tempFilePath = path.join(__dirname, '../../temp', `transcribe_${Date.now()}_${req.file.originalname}`);

        // Ensure temp directory exists
        const tempDir = path.dirname(tempFilePath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        fs.writeFileSync(tempFilePath, req.file.buffer);

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-large-v3',
            response_format: 'json',
            language: 'en', // default
        });

        // Clean up
        fs.unlinkSync(tempFilePath);

        res.status(200).json({
            success: true,
            text: transcription.text
        });

    } catch (error) {
        console.error('[AI] Transcription Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error transcribing audio',
            error: error.message
        });
    }
};
