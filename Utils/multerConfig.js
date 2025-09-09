import dotenv from "dotenv";
dotenv.config();
import multer from "multer";

import cloudinaryModule from "cloudinary";
const { v2: cloudinary } = cloudinaryModule;


import { CloudinaryStorage } from "multer-storage-cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer with Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profiles",
    allowed_formats: ["jpg", "jpeg", "png"],
    public_id: (req, file) => `profile_${req.user?.id || Date.now()}`,
  },
});

const upload = multer({ storage });

export default upload;