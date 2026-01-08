const mongoose = require('mongoose');
const { uploadImageBuffer } = require('../config/cloudinary');
const User = require('../models/User');

/**
 * @desc    Render Web Upload Page
 * @route   GET /api/web-upload
 * @access  Private (via Token)
 */
exports.renderUploadPage = async (req, res) => {
    const { token, type, clubId, messageType, redirectUrl } = req.query;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Media Upload | Mavericks</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0A66C2;
            --primary-dark: #004182;
            --bg: #F3F2EF;
            --card: #FFFFFF;
            --text: #191919;
            --text-secondary: #666666;
            --success: #057642;
            --error: #D11124;
            --border: #DEE3E9;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Inter', sans-serif;
        }

        body {
            background-color: var(--bg);
            color: var(--text);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            background: var(--card);
            width: 100%;
            max-width: 450px;
            padding: 32px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            text-align: center;
        }

        .logo {
            font-size: 24px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        h1 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        p {
            color: var(--text-secondary);
            font-size: 14px;
            margin-bottom: 32px;
        }

        .upload-area {
            border: 2px dashed var(--border);
            border-radius: 8px;
            padding: 40px 20px;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            margin-bottom: 24px;
        }

        .upload-area:hover {
            border-color: var(--primary);
            background: rgba(10, 102, 194, 0.02);
        }

        .upload-area i {
            display: block;
            font-size: 40px;
            color: var(--primary);
            margin-bottom: 12px;
        }

        .upload-area span {
            font-size: 14px;
            color: var(--text-secondary);
        }

        #file-info {
            margin-top: 12px;
            font-size: 13px;
            font-weight: 500;
            color: var(--primary);
            display: none;
        }

        input[type="file"] {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
        }

        .btn {
            background: var(--primary);
            color: white;
            border: none;
            width: 100%;
            padding: 14px;
            border-radius: 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            text-decoration: none;
        }

        .btn:disabled {
            background: #A0B1C5;
            cursor: not-allowed;
        }

        .btn:hover:not(:disabled) {
            background: var(--primary-dark);
        }

        #status {
            margin-top: 20px;
            margin-bottom: 10px;
            font-size: 14px;
            display: none;
            padding: 10px;
            border-radius: 6px;
        }

        #status.success { 
            color: var(--success); 
            background: #E6F4EA;
            display: block; 
        }
        #status.error { 
            color: var(--error); 
            background: #FCE8E6;
            display: block; 
        }

        .progress-container {
            margin-top: 20px;
            display: none;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: #E0E0E0;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .progress-fill {
            height: 100%;
            background: var(--primary);
            width: 0%;
            transition: width 0.1s ease;
        }

        .progress-text {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .loader-spin {
            width: 20px;
            height: 20px;
            border: 2px solid #FFF;
            border-bottom-color: transparent;
            border-radius: 50%;
            display: none;
            animation: rotation 1s linear infinite;
        }

        @keyframes rotation {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .type-badge {
            display: inline-block;
            padding: 4px 12px;
            background: #E8F2FF;
            color: var(--primary);
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 16px;
        }

        #return-btn {
            margin-top: 20px;
            background: #6B7280;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #return-btn:hover {
            background: #4B5563;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <span>Mavericks</span>
        </div>
        <div class="type-badge">${type || 'Media'} Upload</div>
        <h1>Select Media</h1>
        <p>Choose a photo or video to upload to Mavericks.</p>

        <form id="uploadForm">
            <div class="upload-area" id="dropArea">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0A66C2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span>Tap to browse files</span>
                <input type="file" id="fileInput" name="file" accept="image/*,video/*" required>
                <div id="file-info">Selected file: <span id="file-name"></span></div>
            </div>

            <button type="submit" id="submitBtn" class="btn">
                <span class="loader-spin" id="loader"></span>
                <span id="btnText">Upload Media</span>
            </button>
        </form>

        <div class="progress-container" id="progressContainer">
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="progress-text" id="progressText">0%</div>
        </div>

        <div id="status"></div>

        <a href="${redirectUrl || 'mavericks://upload-success'}" id="return-btn" class="btn">Cancel & Return</a>
    </div>

    <script>
        const form = document.getElementById('uploadForm');
        const fileInput = document.getElementById('fileInput');
        const fileInfo = document.getElementById('file-info');
        const fileName = document.getElementById('file-name');
        const submitBtn = document.getElementById('submitBtn');
        const loader = document.getElementById('loader');
        const btnText = document.getElementById('btnText');
        const status = document.getElementById('status');
        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const returnBtn = document.getElementById('return-btn');

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                fileName.textContent = e.target.files[0].name;
                fileInfo.style.display = 'block';
            } else {
                fileInfo.style.display = 'none';
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (!fileInput.files.length) return;

            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', "${type || ''}");
            formData.append('clubId', "${clubId || ''}");
            formData.append('messageType', "${messageType || ''}");

            // UI State
            submitBtn.disabled = true;
            loader.style.display = 'inline-block';
            btnText.textContent = 'Uploading...';
            status.style.display = 'none';
            progressContainer.style.display = 'block';

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressText.textContent = percent + '%';
                }
            });

            xhr.addEventListener('load', () => {
                const result = JSON.parse(xhr.responseText);
                
                if (xhr.status >= 200 && xhr.status < 300 && result.success) {
                    status.textContent = 'Upload successful! Returning to app...';
                    status.className = 'success';
                    btnText.textContent = 'Success!';
                    loader.style.display = 'none';

                    const mediaUrl = encodeURIComponent(result.data.url);
                    const publicId = encodeURIComponent(result.data.publicId || '');
                    const baseUrl = "${redirectUrl || 'mavericks://upload-success'}";
                    const separator = baseUrl.includes('?') ? '&' : '?';
                    const deepLink = baseUrl + separator + "url=" + mediaUrl + "&publicId=" + publicId;

                    // Update Return Button
                    returnBtn.href = deepLink;
                    returnBtn.style.display = 'flex';

                    // Automatic redirect
                    setTimeout(() => {
                        window.location.href = deepLink;
                    }, 1500);
                } else {
                    handleError(result.message || 'Server error occurred');
                }
            });

            xhr.addEventListener('error', () => {
                handleError('Network error occurred. Please check your connection.');
            });

            xhr.open('POST', '/api/web-upload');
            xhr.setRequestHeader('Authorization', 'Bearer ${token}');
            xhr.send(formData);

            function handleError(msg) {
                status.textContent = "Error: " + msg;
                status.className = 'error';
                submitBtn.disabled = false;
                loader.style.display = 'none';
                btnText.textContent = 'Try Again';
                progressContainer.style.display = 'none';

                // Allow returning with error
                const baseUrl = "${redirectUrl || 'mavericks://upload-success'}";
                const separator = baseUrl.includes('?') ? '&' : '?';
                const errorLink = baseUrl + separator + "error=" + encodeURIComponent(msg);
                returnBtn.href = errorLink;
                returnBtn.textContent = 'Return to App (with error)';
                returnBtn.style.display = 'flex';
            }
        });

        // Handle Cancel
        document.getElementById('return-btn').addEventListener('click', (e) => {
            if (!e.target.href.includes('url=') && !e.target.href.includes('error=')) {
                const baseUrl = "${redirectUrl || 'mavericks://upload-success'}";
                const separator = baseUrl.includes('?') ? '&' : '?';
                e.target.href = baseUrl + separator + "status=cancelled";
            }
        });
    </script>
</body>
</html>

    `;

    res.send(html);
};

/**
 * @desc    Handle Web Upload Post
 * @route   POST /api/web-upload
 * @access  Private
 */
exports.handleWebUpload = async (req, res) => {
    try {
        console.log('Web Upload POST reached:', {
            file: req.file ? req.file.originalname : 'No file',
            user: req.user._id
        });

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Determine folder based on context if provided
        const { type } = req.body;
        let folder = 'mavericks/others';

        if (type === 'profile') folder = 'mavericks/profiles';
        else if (type === 'gallery') folder = 'mavericks/gallery';
        else if (type === 'message' || type === 'chat') folder = 'mavericks/chat';
        else if (type === 'snap') folder = 'mavericks/snaps';

        // Upload to Cloudinary using buffer
        const result = await uploadImageBuffer(req.file.buffer, folder);

        res.status(200).json({
            success: true,
            data: {
                url: result.url,
                publicId: result.publicId
            }
        });
    } catch (error) {
        console.error('Web Upload Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error during upload'
        });
    }
};

/**
 * @desc    Handle Base64 Upload (for instant Android uploads)
 * @route   POST /api/web-upload/base64
 * @access  Private
 */
exports.handleBase64Upload = async (req, res) => {
    try {
        const { image, type } = req.body;
        if (!image) {
            return res.status(400).json({ success: false, message: 'No image data provided' });
        }

        let folder = 'mavericks/others';
        if (type === 'profile') folder = 'mavericks/profiles';
        else if (type === 'gallery') folder = 'mavericks/gallery';
        else if (type === 'message' || type === 'chat') folder = 'mavericks/chat';
        else if (type === 'snap') folder = 'mavericks/snaps';

        const base64Data = image.split(',')[1] || image;
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadImageBuffer(buffer, folder);

        res.status(200).json({
            success: true,
            data: {
                url: result.url,
                publicId: result.publicId
            }
        });
    } catch (error) {
        console.error('Base64 Upload Error:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
};
