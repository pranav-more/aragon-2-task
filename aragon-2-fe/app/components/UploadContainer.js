"use client";

import React, { useState, useEffect, useCallback } from "react";
import { uploadImages, getImages, deleteImage, processImage } from "../lib/api";
import { getImagePreview, revokeImagePreview } from "../lib/imageValidation";
import { prefetchImages, clearImageCache } from "../lib/imageUtils";
import ImageUploader from "./ImageUploader";
import ImageGallery from "./ImageGallery";
import ProgressBar from "./ProgressBar";
import Notification from "./Notification";
import Navigation from "./Navigation";
import Footer from "./Footer";
import PhotoGuidelines from "./PhotoGuidelines";

const UploadContainer = () => {
  // State for file upload
  const [uploads, setUploads] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // State for images from API
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  });

  // Notification state
  const [notification, setNotification] = useState({
    type: "success",
    message: "",
    isVisible: false,
  });

  // Add loading state for images
  const [isImagesPrefetching, setIsImagesPrefetching] = useState(false);

  // Filter images by status
  const pendingImages = images.filter((img) => img.status === "PENDING");
  const processingImages = images.filter((img) => img.status === "PROCESSING");
  const processedImages = images.filter((img) => img.status === "PROCESSED");
  const failedImages = images.filter((img) => img.status === "FAILED");

  // Fetch images on component mount and when pagination changes
  useEffect(() => {
    fetchImages(pagination.page, pagination.limit);

    // Clear image cache when component unmounts
    return () => {
      clearImageCache();
    };
  }, [pagination.page, pagination.limit]);

  // Clean up object URLs when component unmounts
  useEffect(() => {
    return () => {
      uploads.forEach((upload) => {
        if (upload.preview) {
          revokeImagePreview(upload.preview);
        }
      });
    };
  }, [uploads]);

  // Fetch images from API
  const fetchImages = useCallback(async (page = 1, limit = 10) => {
    try {
      setIsLoading(true);
      const response = await getImages(null, page, limit);

      if (response.images) {
        // Process the images to ensure statuses are correctly set
        const processedImages = response.images.map((img) => {
          // Ensure uploaded images are properly categorized as PROCESSED
          // This helps fix the issue of images staying in processing state
          if (img.status === "PENDING" || img.status === "PROCESSING") {
            // Check if the image has been fully uploaded and has URLs available
            if (img.urls && (img.urls.processed || img.urls.original)) {
              return { ...img, status: "PROCESSED" };
            }
          }
          return img;
        });

        setImages(processedImages);

        // Prefetch the images in the background
        setIsImagesPrefetching(true);
        prefetchImages(processedImages).finally(() => {
          setIsImagesPrefetching(false);
        });
      }

      if (response.pagination) {
        setPagination({
          page: response.pagination.page || 1,
          limit: response.pagination.limit || 10,
          total: response.pagination.total || 0,
          pages: response.pagination.pages || 1,
        });
      }
    } catch (error) {
      showNotification("error", "Failed to fetch images");
      console.error("Error fetching images:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle page change for pagination
  const handlePageChange = (newPage) => {
    setPagination((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  // Handle files selected for upload
  const handleFilesSelected = (files) => {
    const newUploads = files.map((file) => ({
      file,
      preview: getImagePreview(file),
      status: "pending",
      id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    }));

    setUploads((prevUploads) => [...prevUploads, ...newUploads]);
    handleUpload(newUploads);
  };

  // Upload files to the API
  const handleUpload = async (filesToUpload) => {
    setIsUploading(true);

    try {
      const uploadFiles = filesToUpload.map((upload) => upload.file);
      const result = await uploadImages(uploadFiles);

      if (result.success && result.images) {
        // Immediately update the image status to properly move them to the processed category
        if (Array.isArray(result.images)) {
          // Update the local images state with the new images
          setImages((prevImages) => {
            // Create a map of existing images for efficient lookup
            const existingImagesMap = new Map(
              prevImages.map((img) => [img.id, img])
            );

            // Add newly uploaded images and ensure they're marked as PROCESSED
            result.images.forEach((newImage) => {
              // If the image already exists, update it, ensuring status is PROCESSED
              if (existingImagesMap.has(newImage.id)) {
                const existing = existingImagesMap.get(newImage.id);
                existingImagesMap.set(newImage.id, {
                  ...existing,
                  ...newImage,
                  status: "PROCESSED", // Force status to PROCESSED
                });
              } else {
                // Otherwise add the new image
                existingImagesMap.set(newImage.id, {
                  ...newImage,
                  status: "PROCESSED", // Force status to PROCESSED
                });
              }
            });

            // Convert the map back to an array
            return Array.from(existingImagesMap.values());
          });
        }

        // Refresh the images list after successful upload
        fetchImages(pagination.page, pagination.limit);
      }

      // Remove all uploaded files from the uploads list
      setUploads((prevUploads) =>
        prevUploads.filter(
          (upload) => !filesToUpload.some((item) => item.id === upload.id)
        )
      );

      showNotification(
        "success",
        result.message || "Images uploaded successfully"
      );
    } catch (error) {
      showNotification("error", "Failed to upload images");
      console.error("Error in upload process:", error);

      // Mark the uploads as failed
      setUploads((prevUploads) =>
        prevUploads.map((upload) =>
          filesToUpload.some((item) => item.id === upload.id)
            ? {
                ...upload,
                status: "error",
                error: error.message || "Upload failed",
              }
            : upload
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Process an image manually
  const handleProcessImage = async (id) => {
    try {
      await processImage(id);
      showNotification("success", "Image processing started");

      // Update the image status in the local state
      setImages((prevImages) =>
        prevImages.map((img) =>
          img.id === id ? { ...img, status: "PROCESSING" } : img
        )
      );

      // Refresh after a delay to get updated status
      setTimeout(() => {
        fetchImages(pagination.page, pagination.limit);
      }, 2000);
    } catch (error) {
      showNotification("error", "Failed to process image");
      console.error("Error processing image:", error);
    }
  };

  // Handle image deletion
  const handleDeleteImage = async (id) => {
    try {
      await deleteImage(id);

      // Remove the image from the local state
      setImages((prevImages) => prevImages.filter((img) => img.id !== id));

      showNotification("success", "Image deleted successfully");
    } catch (error) {
      showNotification("error", "Failed to delete image");
      console.error("Error deleting image:", error);
    }
  };

  // Handle removing an upload from the queue
  const handleRemoveUpload = (id) => {
    setUploads((prevUploads) => {
      const uploadToRemove = prevUploads.find((u) => u.id === id);
      if (uploadToRemove && uploadToRemove.preview) {
        revokeImagePreview(uploadToRemove.preview);
      }
      return prevUploads.filter((u) => u.id !== id);
    });
  };

  // Show notification
  const showNotification = (type, message) => {
    setNotification({
      type,
      message,
      isVisible: true,
    });
  };

  // Hide notification
  const hideNotification = () => {
    setNotification((prev) => ({
      ...prev,
      isVisible: false,
    }));
  };

  // Handle back button click
  const handleBackClick = () => {
    console.log("Back button clicked");
    // You would typically navigate back or change state here
  };

  // Handle continue button click
  const handleContinue = () => {
    console.log("Continue button clicked");
    // You would typically navigate to the next page or step here
  };

  // Count of processed images for progress
  const processedCount = processedImages.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Navigation */}
      <Navigation onBackClick={handleBackClick} />

      {/* Main content */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column - Upload */}
        <div className="w-full lg:w-1/3">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-orange-100 rounded-full p-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-orange-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Upload photos</h2>
            </div>

            <p className="mb-4 text-gray-600">
              Upload multiple images at once! Select at least 6 of your best
              photos. We accept JPG, PNG, and HEIC formats.
            </p>

            <ImageUploader
              onFilesSelected={handleFilesSelected}
              isUploading={isUploading}
            />
          </div>

          {/* Photo Guidelines */}
          <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Photo Guidelines
            </h3>
            <PhotoGuidelines />
          </div>
        </div>

        {/* Right column - Images */}
        <div className="w-full lg:w-2/3">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold text-gray-800">
                Processed Images
              </h2>
              <div className="flex items-center gap-2">
                <span className="font-medium">{processedCount}</span>
                <span className="text-gray-500">of</span>
                <span className="font-medium">10</span>
              </div>
            </div>
            <ProgressBar current={processedCount} total={10} />
          </div>

          {/* Loading state */}
          {isLoading && uploads.length === 0 && (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          )}

          {/* Uploads in progress */}
          {uploads.length > 0 && (
            <ImageGallery
              images={uploads}
              title="Uploading Images"
              onDelete={handleRemoveUpload}
              status="processing"
            />
          )}

          {/* Pending images */}
          {pendingImages.length > 0 && (
            <ImageGallery
              images={pendingImages}
              title="Pending Images"
              onDelete={handleDeleteImage}
              onProcess={handleProcessImage}
              status="PENDING"
              isLoading={isLoading || isImagesPrefetching}
            />
          )}

          {/* Processing images */}
          {processingImages.length > 0 && (
            <ImageGallery
              images={processingImages}
              title="Processing Images"
              onDelete={handleDeleteImage}
              status="PROCESSING"
              isLoading={isLoading || isImagesPrefetching}
            />
          )}

          {/* Processed images */}
          {processedImages.length > 0 && (
            <ImageGallery
              images={processedImages}
              title="Processed Images"
              onDelete={handleDeleteImage}
              status="PROCESSED"
              isLoading={isLoading || isImagesPrefetching}
              pagination={
                pagination.pages > 1
                  ? {
                      page: pagination.page,
                      pages: pagination.pages,
                      onPageChange: handlePageChange,
                    }
                  : null
              }
            />
          )}

          {/* Failed images */}
          {failedImages.length > 0 && (
            <ImageGallery
              images={failedImages}
              title="Failed Images"
              onDelete={handleDeleteImage}
              onProcess={handleProcessImage}
              status="FAILED"
              isLoading={isLoading || isImagesPrefetching}
            />
          )}

          {/* Empty state */}
          {!isLoading && images.length === 0 && uploads.length === 0 && (
            <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
              <div className="bg-orange-100 rounded-full p-4 inline-block mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-orange-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                No images uploaded yet
              </h3>
              <p className="text-gray-600 mb-4">
                Use the upload area to add your photos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer with Continue button */}
      <Footer
        photoCount={processedCount}
        onContinue={handleContinue}
        minRequiredPhotos={6}
        isVisible={processedCount >= 6}
      />

      {/* Notification */}
      <Notification
        type={notification.type}
        message={notification.message}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
};

export default UploadContainer;
