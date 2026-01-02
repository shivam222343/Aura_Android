@echo off
echo Creating .env file for Mavericks Backend...
echo.

(
echo PORT=5000
echo NODE_ENV=development
echo MONGODB_URI=mongodb://localhost:27017/mavericks
echo JWT_SECRET=mavericks_super_secret_jwt_key_change_this_in_production_2024
echo JWT_EXPIRE=7d
echo FRONTEND_URL=http://localhost:8081
echo CLOUDINARY_CLOUD_NAME=your_cloud_name
echo CLOUDINARY_API_KEY=your_api_key
echo CLOUDINARY_API_SECRET=your_api_secret
echo EMAIL_HOST=smtp.gmail.com
echo EMAIL_PORT=587
echo EMAIL_USER=your_email@gmail.com
echo EMAIL_PASSWORD=your_app_password
echo GOOGLE_AI_API_KEY=your_google_gemini_api_key
echo GROQ_API_KEY=your_groq_api_key
echo ADMIN_SUPER_KEY=MAVERICKS_SUPER_KEY_2024
) > .env

echo .env file created successfully!
echo.
echo You can now start the backend with: npm run dev
pause
