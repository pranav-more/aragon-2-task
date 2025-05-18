const AWS = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Determine if we should use local storage
const useLocalStorage =
  !process.env.AWS_ACCESS_KEY_ID || process.env.STORAGE_TYPE === "local";

// Create S3 instance if credentials are available
let s3 = null;
if (!useLocalStorage) {
  // Configure AWS SDK with proper credential handling
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });

  // Create S3 instance
  s3 = new AWS.S3();
}

// Configure multer based on storage type
let upload;
if (useLocalStorage) {
  // Ensure upload directories exist
  const uploadDir = path.join(process.cwd(), "uploads");
  const originalDir = path.join(uploadDir, "original");

  if (!fs.existsSync(originalDir)) {
    fs.mkdirSync(originalDir, { recursive: true });
  }

  // Configure local storage
  upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, originalDir);
      },
      filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${uuidv4()}${fileExtension}`;
        cb(null, fileName);
      },
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept images only
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i)) {
        return cb(new Error("Only image files are allowed!"), false);
      }
      cb(null, true);
    },
  });
} else {
  // Configure S3 storage
  upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: process.env.S3_BUCKET_NAME,
      acl: "private",
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${uuidv4()}${fileExtension}`;
        const filePath = `uploads/original/${fileName}`;
        cb(null, filePath);
      },
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept images only
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif|heic|heif)$/i)) {
        return cb(new Error("Only image files are allowed!"), false);
      }
      cb(null, true);
    },
  });
}

// S3 operations with local fallback
const s3Operations = {
  // Upload file to S3 or local filesystem
  uploadFile: async (fileBuffer, fileName, contentType) => {
    if (useLocalStorage) {
      // Local file storage
      const filePath = path.join(process.cwd(), fileName);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      await fs.promises.writeFile(filePath, fileBuffer);
      return {
        Key: fileName,
        Location: `file://${filePath}`,
      };
    } else {
      // S3 storage
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileName,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: "private",
      };

      return s3.upload(params).promise();
    }
  },

  // Delete file from S3 or local filesystem
  deleteFile: async (fileKey) => {
    if (useLocalStorage) {
      // Local file deletion
      const filePath = path.join(process.cwd(), fileKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return { success: true };
    } else {
      // S3 deletion
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
      };

      return s3.deleteObject(params).promise();
    }
  },

  // Get file from S3 or local filesystem
  getFile: async (fileKey) => {
    if (useLocalStorage) {
      // Local file retrieval
      const filePath = path.join(process.cwd(), fileKey);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileKey}`);
      }

      const data = await fs.promises.readFile(filePath);
      return { Body: data };
    } else {
      // S3 retrieval
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
      };

      return s3.getObject(params).promise();
    }
  },

  // Generate a signed URL for temporary access or local file path
  getSignedUrl: (fileKey, expiresIn = 3600) => {
    if (useLocalStorage) {
      // Local file URL
      const filePath = path.join(process.cwd(), fileKey);
      return `file://${filePath}`;
    } else {
      // S3 signed URL
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Expires: expiresIn,
      };

      return s3.getSignedUrl("getObject", params);
    }
  },
};

module.exports = {
  upload,
  s3,
  s3Operations,
  useLocalStorage,
};
