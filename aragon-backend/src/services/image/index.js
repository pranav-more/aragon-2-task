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
const { detectFaces, validateFaceCount } = require("./faceDetection");

module.exports = {
  // Image validation
  validateImageSize,

  // Blur detection
  detectBlurryImage,

  // Face detection
  detectFaces,
  validateFaceCount,

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
