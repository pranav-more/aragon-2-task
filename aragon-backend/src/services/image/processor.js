const sharp = require("sharp");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { ApiError } = require("../../utils/errorHandler");

// Import modules
const { validateImageSize } = require("./sizeValidation");
const { detectBlurryImage } = require("./blurDetection");
const {
  generateImageHash,
  checkDuplicateImage,
} = require("./duplicateDetection");
const { getImageBuffer, saveImageToStorage } = require("./storage");
const { validateFacesWithOverride } = require("./faceDetection");

const prisma = new PrismaClient();

/**
 * Process an image
 * @param {string} imageId - The image ID
 * @returns {Promise<object>} - The processed image
 */
const processImage = async (imageId) => {
  let image = await prisma.image.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw new ApiError(404, "Image not found");
  }

  // Only process images with PENDING status
  if (image.status !== "PENDING") {
    console.log(`Skipping image ${imageId} with status ${image.status}`);
    return image;
  }

  try {
    // Update status to PROCESSING
    await prisma.image.update({
      where: { id: imageId },
      data: {
        status: "PROCESSING",
      },
    });

    // Get image buffer from storage
    const imageBuffer = await getImageBuffer(image.originalPath);

    // Validate image size
    const sizeValidation = await validateImageSize(imageBuffer);
    if (!sizeValidation.isValid) {
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "FAILED",
          metaData: {
            rejectionReason: sizeValidation.reason,
            validationErrors: ["size_validation_failed"],
            width: imageBuffer
              ? (
                  await sharp(imageBuffer).metadata()
                ).width
              : null,
            height: imageBuffer
              ? (
                  await sharp(imageBuffer).metadata()
                ).height
              : null,
            fileSize: imageBuffer ? imageBuffer.length : null,
          },
        },
      });
      return await prisma.image.findUnique({ where: { id: imageId } });
    }

    // Check for multiple faces in the image
    let faceValidation;
    try {
      faceValidation = await validateFacesWithOverride(imageBuffer);
      if (!faceValidation.isValid) {
        console.log(
          `Rejecting image ${imageId} due to multiple faces detection`
        );
        await prisma.image.update({
          where: { id: imageId },
          data: {
            status: "FAILED",
            metaData: {
              rejectionReason: faceValidation.reason,
              validationErrors: ["multiple_faces_detected"],
              faceData: faceValidation.details,
            },
          },
        });
        return await prisma.image.findUnique({ where: { id: imageId } });
      }
    } catch (faceError) {
      console.error(
        `Error during face validation for image ${imageId}:`,
        faceError
      );
      // Continue with processing if face detection fails, don't reject the image
      faceValidation = {
        isValid: true,
        details: { faceCount: 0, error: faceError.message },
      };
    }

    // Check if image is blurry
    const blurDetection = await detectBlurryImage(imageBuffer);
    console.log(
      `Final blur detection result for image ${imageId}: isBlurry=${blurDetection.isBlurry}, reason=${blurDetection.reason}`
    );

    if (blurDetection.isBlurry) {
      console.log(`Rejecting image ${imageId} due to blur detection`);
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "FAILED",
          metaData: {
            rejectionReason: `Image is too blurry. Please upload a clearer photo.`,
            validationErrors: ["blurry_image_detected"],
            blurDetails: blurDetection.details || {
              reason: blurDetection.reason,
            },
          },
        },
      });
      return await prisma.image.findUnique({ where: { id: imageId } });
    }

    // Generate hash and check for duplicates
    const imageHash = await generateImageHash(imageBuffer);
    const { isDuplicate, similarImage } = await checkDuplicateImage(
      imageHash,
      imageId,
      image.originalName
    );

    if (isDuplicate) {
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "FAILED",
          metaData: {
            rejectionReason: `Duplicate of image: ${similarImage.id} (${similarImage.originalName})`,
            validationErrors: ["duplicate_image_detected"],
            pHash: imageHash,
            similarTo: similarImage.id,
          },
        },
      });
      return await prisma.image.findUnique({ where: { id: imageId } });
    }

    // Process the image (example: resize, optimize, etc.)
    const processedImageBuffer = await sharp(imageBuffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Get metadata for the processed image
    const metadata = await sharp(processedImageBuffer).metadata();

    // Prepare filename for processed image
    const filename = `${
      path.parse(image.originalName).name
    }-processed-${Date.now()}${path.extname(image.originalName)}`;

    // Save processed image
    const processedPath = await saveImageToStorage(
      processedImageBuffer,
      filename,
      "uploads/processed"
    );

    // Update the image record with the processed information
    image = await prisma.image.update({
      where: { id: imageId },
      data: {
        processedPath,
        processedSize: processedImageBuffer.length,
        status: "PROCESSED",
        metaData: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          pHash: imageHash,
          processingTime: new Date().toISOString(),
          faceCount: faceValidation.details.faceCount || 0,
        },
      },
    });

    return image;
  } catch (error) {
    console.error(`Error processing image ${imageId}:`, error);

    // Create a user-friendly error message
    let userFriendlyMessage = "Image processing failed";
    let validationError = "processing_error";

    // Check for specific error types and provide friendly messages
    if (error.message?.includes("duplicate")) {
      userFriendlyMessage =
        "This image appears to be a duplicate of one you've already uploaded";
      validationError = "duplicate_image_detected";
    } else if (
      error.message?.includes("resolution") ||
      error.message?.includes("dimensions")
    ) {
      userFriendlyMessage =
        "Image resolution is too low. Please upload a larger image (minimum 800x800px)";
      validationError = "size_validation_failed";
    } else if (error.message?.includes("size")) {
      userFriendlyMessage =
        "Image file size is too small. Please upload a larger image file (minimum 100KB)";
      validationError = "size_validation_failed";
    } else if (
      error.message?.includes("format") ||
      error.message?.includes("unsupported")
    ) {
      userFriendlyMessage =
        "Unsupported image format. Please use JPEG, PNG, or HEIC formats";
      validationError = "format_validation_failed";
    } else if (error.message?.includes("face")) {
      userFriendlyMessage =
        "Multiple faces detected in image. Please upload a photo with at most one face.";
      validationError = "multiple_faces_detected";
    }

    // Update the image status to FAILED with a user-friendly message
    await prisma.image.update({
      where: { id: imageId },
      data: {
        status: "FAILED",
        metaData: {
          rejectionReason: userFriendlyMessage,
          validationErrors: [validationError],
          technicalError:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        },
      },
    });

    // Return the updated image rather than throwing
    return await prisma.image.findUnique({ where: { id: imageId } });
  }
};

/**
 * Delete an image and its files
 * @param {string} imageId - The image ID
 * @returns {Promise<void>}
 */
const deleteImage = async (imageId) => {
  const image = await prisma.image.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw new ApiError(404, "Image not found");
  }

  // Delete the image files using the storage module's deleteImageFiles function
  const { deleteImageFiles } = require("./storage");
  await deleteImageFiles(image.originalPath, image.processedPath);

  // Delete database record
  await prisma.image.delete({
    where: { id: imageId },
  });
};

module.exports = {
  processImage,
  deleteImage,
};
