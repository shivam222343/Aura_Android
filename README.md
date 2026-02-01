# Mavericks Club Management Platform - Backend API

## 🚀 Overview
RESTful API built with Node.js, Express.js, and MongoDB for the Mavericks Club Management Platform.

## 📋 Features
- ✅ User Authentication (JWT)
- ✅ Club Management
- ✅ Meeting Scheduling & Attendance
- ✅ Task Assignment & Tracking
- ✅ Real-time Chat (Socket.io)
- ✅ Notifications System
- ✅ Gallery Management
- ✅ QR Code Generation
- ✅ File Upload (Cloudinary)
- ✅ Role-based Access Control

## 🛠️ Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time**: Socket.io
- **File Storage**: Cloudinary
- **Security**: Helmet, CORS, Rate Limiting
- **Email**: Nodemailer
- **Validation**: Express-validator

## 📁 Project Structure
```
mavericks-backend/
├── src/
│   ├── config/
│   │   ├── database.js          # MongoDB connection
│   │   └── cloudinary.js        # Cloudinary configuration
│   ├── models/
│   │   ├── User.js              # User schema
│   │   ├── Club.js              # Club schema
│   │   ├── Meeting.js           # Meeting schema
│   │   ├── Task.js              # Task schema
│   │   ├── Notification.js      # Notification schema
│   │   ├── Message.js           # Message schema
│   │   └── Gallery.js           # Gallery schema
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── clubController.js    # Club management
│   │   ├── meetingController.js # Meeting management
│   │   ├── taskController.js    # Task management
│   │   └── ...
│   ├── routes/
│   │   ├── auth.js              # Auth routes
│   │   ├── clubs.js             # Club routes
│   │   ├── meetings.js          # Meeting routes
│   │   ├── tasks.js             # Task routes
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   └── upload.js            # File upload handling
│   ├── services/
│   │   ├── emailService.js      # Email notifications
│   │   ├── notificationService.js # Push notifications
│   │   └── taskReminderService.js # Task reminders
│   └── utils/
│       ├── validators.js        # Input validation
│       └── helpers.js           # Helper functions
├── .env.example                 # Environment variables template
├── .gitignore
├── package.json
└── server.js                    # Entry point
```

## 🔧 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Cloudinary account (for file uploads)

### Steps
1. **Clone the repository**
   ```bash
   cd mavericks-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your configuration:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/mavericks
   JWT_SECRET=your_super_secret_key
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/auth/signup` | Register new user | Public |
| POST | `/api/auth/signin` | Login user | Public |
| POST | `/api/auth/logout` | Logout user | Private |
| GET | `/api/auth/me` | Get current user | Private |
| PUT | `/api/auth/update-profile` | Update profile | Private |
| POST | `/api/auth/upload-profile-picture` | Upload profile picture | Private |
| PUT | `/api/auth/change-password` | Change password | Private |
| PUT | `/api/auth/fcm-token` | Update FCM token | Private |

### Clubs
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/clubs` | Get all clubs | Private |
| GET | `/api/clubs/:id` | Get club by ID | Private |
| POST | `/api/clubs` | Create new club | Admin |
| PUT | `/api/clubs/:id` | Update club | Admin |
| DELETE | `/api/clubs/:id` | Delete club | Admin |
| POST | `/api/clubs/join` | Join club with access key | Private |
| POST | `/api/clubs/:id/generate-key` | Generate access key | Admin |

### Meetings
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/meetings` | Get all meetings | Private |
| GET | `/api/meetings/:id` | Get meeting by ID | Private |
| POST | `/api/meetings` | Create meeting | Admin/Subadmin |
| PUT | `/api/meetings/:id` | Update meeting | Admin/Subadmin |
| DELETE | `/api/meetings/:id` | Delete meeting | Admin |
| POST | `/api/meetings/:id/attendance` | Mark attendance | Admin/Subadmin |
| POST | `/api/meetings/:id/absence` | Request absence | Private |
| PUT | `/api/meetings/:id/absence/:absenceId` | Approve/reject absence | Admin/Subadmin |

### Tasks
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/tasks` | Get user tasks | Private |
| GET | `/api/tasks/:id` | Get task by ID | Private |
| POST | `/api/tasks` | Create task | Admin/Subadmin |
| PUT | `/api/tasks/:id` | Update task | Admin/Subadmin |
| PUT | `/api/tasks/:id/status` | Update task status | Private |
| DELETE | `/api/tasks/:id` | Delete task | Admin |

### Notifications
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/notifications` | Get user notifications | Private |
| PUT | `/api/notifications/:id/read` | Mark as read | Private |
| DELETE | `/api/notifications/:id` | Delete notification | Private |
| DELETE | `/api/notifications/clear-all` | Clear all notifications | Private |

### Messages
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/messages/:userId` | Get messages with user | Private |
| POST | `/api/messages` | Send message | Private |
| PUT | `/api/messages/:id/read` | Mark as read | Private |
| DELETE | `/api/messages/:id` | Delete message | Private |

## 🔐 Authentication
All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 🔌 Socket.io Events

### Client → Server
- `user:online` - User comes online
- `user:offline` - User goes offline
- `message:send` - Send message
- `message:typing` - Typing indicator
- `notification:send` - Send notification

### Server → Client
- `user:status` - User online/offline status
- `message:receive` - Receive message
- `message:typing` - Typing indicator
- `notification:receive` - Receive notification

## 🗄️ Database Models

### User
- Email, password, displayName, phoneNumber
- Profile picture
- Role (admin, subadmin, member)
- Clubs joined
- Online status
- Preferences
- Statistics

### Club
- Name, description, logo
- Admins, subadmins, members
- Access keys
- Settings
- Statistics

### Meeting
- Club ID, name, description
- Date, time, location
- Type, status
- Attendees
- Absence requests
- Agenda, notes
- QR code

### Task
- Meeting ID, club ID
- Title, description
- Assigned to/by
- Due date, status, priority
- Reminders
- Attachments, comments

### Notification
- User ID, type
- Title, message
- Related data
- Read status
- Priority

### Message
- Sender ID, receiver ID
- Content, type
- File URL
- Read status
- Reactions, replies

## 🔄 Background Jobs
- Task reminder processor (runs every 15 minutes)
- Attendance warning processor (runs daily)
- Notification cleanup (auto-delete old notifications)

## 🛡️ Security Features
- JWT authentication
- Password hashing (bcrypt)
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation
- File upload restrictions

## 📝 Environment Variables
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/mavericks
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
FRONTEND_URL=http://localhost:8081
GOOGLE_AI_API_KEY=your_google_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

## 🚀 Deployment

### Heroku
```bash
heroku create mavericks-api
heroku config:set MONGODB_URI=your_mongodb_atlas_uri
heroku config:set JWT_SECRET=your_secret
git push heroku main
```

### Railway
1. Connect GitHub repository
2. Add environment variables
3. Deploy

### Render
1. Create new Web Service
2. Connect repository
3. Add environment variables
4. Deploy

## 📊 API Response Format
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

## ❌ Error Response Format
```json
{
  "success": false,
  "message": "Error message"
}
```

## 📄 License
MIT

## 👥 Contributors
Your Team

## 📞 Support
For support, email support@mavericks.com
#   M a v e r i c k s _ A n d r o i d _ B a c k e n d 
 
 
#   A u r a _ A n d r o i d  
 