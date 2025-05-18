const { PrismaClient } = require("@prisma/client");
const imageService = require("../services/imageService");
const path = require("path");
const { ApiError } = require("../utils/errorHandler");
const { useLocalStorage } = require("../config/s3");

const prisma = new PrismaClient();

const imageController = {
  // Upload multiple images
  uploadImage: async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        throw new ApiError(400, "No files uploaded");
      }

      const uploadedImages = [];
      const processingPromises = [];

      // Process each file
      for (const file of req.files) {
        const fileExtension = path.extname(file.originalname).substring(1);

        // Get file path depending on storage type
        let filePath;
        if (useLocalStorage) {
          // For local storage, we need to create a relative path from the filename
          filePath = `uploads/original/${path.basename(file.path)}`;
        } else {
          // For S3, we use the key directly
          filePath = file.key;
        }

        // Create image record in database
        const image = await prisma.image.create({
          data: {
            originalName: file.originalname,
            originalSize: file.size,
            originalPath: filePath,
            fileType: fileExtension,
            status: "PENDING",
          },
        });

        uploadedImages.push({
          id: image.id,
          status: image.status,
          originalName: image.originalName,
        });

        // Collect processing promises
        processingPromises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              imageService
                .processImage(image.id)
                .catch((err) => {
                  console.error(`Error processing image ${image.id}:`, err);
                })
                .finally(() => resolve());
            }, 0);
          })
        );
      }

      // Start processing all images (non-blocking)
      Promise.all(processingPromises);

      return res.status(201).json({
        success: true,
        message: `${uploadedImages.length} images uploaded successfully`,
        images: uploadedImages,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all images
  getAllImages: async (req, res, next) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;

      const whereClause = status ? { status } : {};

      const [images, total] = await Promise.all([
        prisma.image.findMany({
          where: whereClause,
          skip,
          take: parseInt(limit),
          orderBy: { createdAt: "desc" },
        }),
        prisma.image.count({ where: whereClause }),
      ]);

      // Add signed URLs to each image
      const imagesWithUrls = await Promise.all(
        images.map(async (image) => {
          const urls = {};
          urls.original = await imageService.getImageUrl(image.id, "original");

          if (image.processedPath) {
            urls.processed = await imageService.getImageUrl(
              image.id,
              "processed"
            );
          }

          return {
            ...image,
            urls,
          };
        })
      );

      return res.status(200).json({
        success: true,
        images: imagesWithUrls,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a single image by ID
  getImageById: async (req, res, next) => {
    try {
      const { id } = req.params;

      const image = await prisma.image.findUnique({
        where: { id },
      });

      if (!image) {
        throw new ApiError(404, "Image not found");
      }

      // Generate signed URLs for access
      const urls = {};
      urls.original = await imageService.getImageUrl(id, "original");

      if (image.processedPath) {
        urls.processed = await imageService.getImageUrl(id, "processed");
      }

      return res.status(200).json({
        success: true,
        image: {
          ...image,
          urls,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete an image
  deleteImage: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check if image exists
      const image = await prisma.image.findUnique({
        where: { id },
      });

      if (!image) {
        throw new ApiError(404, "Image not found");
      }

      // Delete image
      await imageService.deleteImage(id);

      return res.status(200).json({
        success: true,
        message: "Image deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },

  // Process image immediately (manual trigger)
  processImage: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check if image exists
      const image = await prisma.image.findUnique({
        where: { id },
      });

      if (!image) {
        throw new ApiError(404, "Image not found");
      }
      console.log(image.status, "image.status");
      if (image.status === "PROCESSED") {
        throw new ApiError(400, "Image already processed");
      }

      // Start processing (non-blocking)
      await imageService.processImage(id);

      return res.status(202).json({
        success: true,
        message: "Image processing started",
        imageId: id,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = imageController;
