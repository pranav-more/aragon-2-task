const { ApiError } = require("../utils/errorHandler");

/**
 * Middleware to validate file upload
 */
const validateFileUpload = (req, res, next) => {
  try {
    // Check if a file was provided
    if (!req.file) {
      throw new ApiError(400, "No file uploaded");
    }

    // Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (req.file.size > MAX_SIZE) {
      throw new ApiError(400, "File size exceeds the limit of 10MB");
    }

    // Check file type
    const allowedFileTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/heic",
      "image/heif",
    ];
    if (!allowedFileTypes.includes(req.file.mimetype.toLowerCase())) {
      throw new ApiError(
        400,
        "Invalid file type. Only JPG, PNG, GIF, HEIC, and HEIF are allowed"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateFileUpload,
};
