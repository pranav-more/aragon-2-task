const sharp = require("sharp");

/**
 * Validates if the image meets the minimum size/resolution requirements
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isValid: boolean, reason: string|null}>} - Validation result
 */
const validateImageSize = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    // Minimum requirements - adjusted for higher quality requirements
    const MIN_WIDTH = 800;
    const MIN_HEIGHT = 800;
    const MIN_SIZE_IN_BYTES = 100 * 1024; // 100 KB

    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      return {
        isValid: false,
        reason: `Image resolution too low. Minimum required: ${MIN_WIDTH}x${MIN_HEIGHT}px, got: ${metadata.width}x${metadata.height}px`,
      };
    }

    if (imageBuffer.length < MIN_SIZE_IN_BYTES) {
      return {
        isValid: false,
        reason: `Image file size too small. Minimum required: ${
          MIN_SIZE_IN_BYTES / 1024
        }KB, got: ${(imageBuffer.length / 1024).toFixed(1)}KB`,
      };
    }

    return { isValid: true, reason: null };
  } catch (error) {
    console.error("Error validating image size:", error);
    return {
      isValid: false,
      reason: `Failed to validate image: ${error.message}`,
    };
  }
};

module.exports = {
  validateImageSize,
};
