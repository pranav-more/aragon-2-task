const { validateImageSize } = require("./sizeValidation");
const { detectBlurryImage } = require("./blurDetection");
const {
  generateImageHash,
  checkDuplicateImage,
} = require("./duplicateDetection");
const {
  getImageUrl,
  deleteImageFiles,
  getImageBuffer,
  saveImageToStorage,
} = require("./storage");
const { processImage, deleteImage } = require("./processor");

module.exports = {
  // Image validation
  validateImageSize,

  // Blur detection
  detectBlurryImage,

  // Duplicate detection
  generateImageHash,
  checkDuplicateImage,

  // Storage functions
  getImageUrl,
  deleteImageFiles,
  getImageBuffer,
  saveImageToStorage,

  // Main processing functions
  processImage,
  deleteImage,
};
