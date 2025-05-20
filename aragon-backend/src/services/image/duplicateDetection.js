const sharp = require("sharp");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * Generates a perceptual hash (pHash) for an image to detect similar images
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<string>} - The image hash
 */
const generateImageHash = async (imageBuffer) => {
  try {
    // Resize to small size for comparison and convert to grayscale
    const resizedImage = await sharp(imageBuffer)
      .resize(32, 32, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    // Calculate the average color value
    let sum = 0;
    for (let i = 0; i < resizedImage.length; i++) {
      sum += resizedImage[i];
    }
    const avg = sum / resizedImage.length;

    // Create a binary hash based on whether each pixel is above or below average
    let binaryHash = "";
    for (let i = 0; i < resizedImage.length; i++) {
      binaryHash += resizedImage[i] >= avg ? "1" : "0";
    }

    // Convert to hexadecimal for storage efficiency
    const hashBuffer = Buffer.from(
      binaryHash
        .match(/.{1,8}/g)
        .map((byte) => parseInt(byte, 2).toString(16).padStart(2, "0"))
        .join(""),
      "hex"
    );

    return crypto.createHash("md5").update(hashBuffer).digest("hex");
  } catch (error) {
    console.error("Error generating image hash:", error);
    throw new Error(`Failed to generate image hash: ${error.message}`);
  }
};

/**
 * Checks if the image is too similar to existing ones
 * @param {string} hash - The perceptual hash of the image
 * @param {string} excludeId - ID of the image to exclude from comparison
 * @param {string} originalFileName - Original file name for quick duplicate check
 * @returns {Promise<{isDuplicate: boolean, similarImage: object|null}>} - Check result
 */
const checkDuplicateImage = async (
  hash,
  excludeId = null,
  originalFileName = ""
) => {
  try {
    // Find all processed images - using simpler query to avoid JSON path issues
    const processedImages = await prisma.image.findMany({
      where: {
        status: "PROCESSED",
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: {
        id: true,
        originalName: true,
        metaData: true,
      },
    });

    // First check: Look for exact file name match (quick check for obvious duplicates)
    if (originalFileName) {
      const exactMatch = processedImages.find(
        (img) =>
          img.originalName.toLowerCase() === originalFileName.toLowerCase()
      );

      if (exactMatch) {
        console.log(`Exact filename match found for ${originalFileName}`);
        return { isDuplicate: true, similarImage: exactMatch };
      }
    }

    // Calculate Hamming distance for each existing image
    // For perceptual hashes, lower hamming distance = more similarity
    const SIMILARITY_THRESHOLD = 3; // Lowered from 5 to make detection more sensitive

    let isDuplicate = false;
    let similarImage = null;

    for (const image of processedImages) {
      // Only check images that have a hash stored in metaData
      if (image.metaData && image.metaData.pHash) {
        const existingHash = image.metaData.pHash;

        // Simplified hamming distance comparison for hex strings
        let distance = 0;
        const hexToBinary = (hex) => {
          return hex
            .split("")
            .map((h) => parseInt(h, 16).toString(2).padStart(4, "0"))
            .join("");
        };

        const binary1 = hexToBinary(hash);
        const binary2 = hexToBinary(existingHash);

        for (let i = 0; i < Math.min(binary1.length, binary2.length); i++) {
          if (binary1[i] !== binary2[i]) distance++;
        }

        console.log(
          `Image hash comparison: Distance ${distance} between ${hash.substring(
            0,
            8
          )} and ${existingHash.substring(0, 8)}`
        );

        if (distance <= SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          similarImage = image;
          console.log(
            `Found duplicate image! ID: ${image.id}, Name: ${image.originalName}`
          );
          break;
        }
      }
    }

    return { isDuplicate, similarImage };
  } catch (error) {
    console.error("Error checking for duplicate images:", error);
    // Return non-duplicate result instead of throwing error to prevent technical errors shown to users
    return { isDuplicate: false, similarImage: null };
  }
};

module.exports = {
  generateImageHash,
  checkDuplicateImage,
};
