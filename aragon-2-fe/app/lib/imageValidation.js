// Maximum file size in bytes (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file extensions and mime types
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic"];
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/octet-stream", // Sometimes HEIC files come as this
];

/**
 * Validates if a file is an image with allowed format and size
 */
export const validateImageFile = (file) => {
  // Check if file exists
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: "File size exceeds 10MB limit" };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const fileExtension = "." + fileName.split(".").pop();

  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: "Only JPEG, PNG, and HEIC formats are allowed",
    };
  }

  // Check mime type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    // Special case for HEIC files that might not have the correct MIME type
    if (fileExtension === ".heic") {
      return { valid: true };
    }
    return {
      valid: false,
      error: "File format not supported",
    };
  }

  return { valid: true };
};

/**
 * Get a preview URL for an image file
 */
export const getImagePreview = (file) => {
  return URL.createObjectURL(file);
};

/**
 * Clean up preview URLs
 */
export const revokeImagePreview = (previewUrl) => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
};
