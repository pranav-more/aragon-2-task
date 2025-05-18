const express = require("express");
const imageController = require("../controllers/imageController");
const { upload } = require("../config/s3");

const router = express.Router();

/**
 * @route   POST /api/images
 * @desc    Upload multiple images
 * @access  Public
 */
router.post("/", upload.array("images", 10), imageController.uploadImage);

/**
 * @route   GET /api/images
 * @desc    Get all images with pagination and filtering
 * @access  Public
 */
router.get("/", imageController.getAllImages);

/**
 * @route   GET /api/images/:id
 * @desc    Get a single image by ID
 * @access  Public
 */
router.get("/:id", imageController.getImageById);

/**
 * @route   DELETE /api/images/:id
 * @desc    Delete an image
 * @access  Public
 */
router.delete("/:id", imageController.deleteImage);

/**
 * @route   POST /api/images/:id/process
 * @desc    Manually trigger image processing
 * @access  Public
 */
router.post("/:id/process", imageController.processImage);

module.exports = router;
