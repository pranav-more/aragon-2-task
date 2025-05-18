"use client";

import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { getBestImageUrl } from "../lib/imageUtils";

const ImagePreview = ({
  image,
  status, // 'processing', 'accepted', 'rejected', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'
  rejectionReason = null,
  onDelete,
  onProcess = null,
  isPreview = false, // If true, it's a local preview before upload
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);

  // Set the image URL when the image changes
  useEffect(() => {
    if (isPreview) {
      setImageUrl(image.preview);
    } else {
      setImageUrl(getBestImageUrl(image));
    }
  }, [image, isPreview]);

  // Normalize status from backend values
  const normalizeStatus = (rawStatus) => {
    // Handle if status is explicitly provided
    if (status) return status;

    // Handle from image object
    if (!image.status) return isPreview ? "processing" : "processing";

    // Handle the case where the image has URLs but status is not updated
    if (
      (image.status === "PENDING" || image.status === "PROCESSING") &&
      image.urls &&
      (image.urls.processed || image.urls.original)
    ) {
      return "accepted"; // Treat as processed if it has processed URLs
    }

    // Map backend status to frontend status
    const statusMap = {
      PENDING: "processing",
      PROCESSING: "processing",
      PROCESSED: "accepted",
      FAILED: "rejected",
    };

    return statusMap[image.status] || "processing";
  };

  const currentStatus = normalizeStatus(status || (image && image.status));

  const statusColors = {
    processing: "bg-yellow-500",
    accepted: "bg-green-500",
    rejected: "bg-red-500",
    PENDING: "bg-yellow-500",
    PROCESSING: "bg-yellow-500",
    PROCESSED: "bg-green-500",
    FAILED: "bg-red-500",
  };

  const getBorderColor = () => {
    if (isPreview) return "border-gray-300";

    switch (currentStatus) {
      case "accepted":
      case "PROCESSED":
        return "border-green-500";
      case "rejected":
      case "FAILED":
        return "border-red-500";
      default:
        return "border-gray-300";
    }
  };

  const getStatusText = () => {
    if (isPreview) return "Uploading...";

    switch (currentStatus) {
      case "accepted":
      case "PROCESSED":
        return "Processed";
      case "rejected":
      case "FAILED":
        return rejectionReason || "Failed";
      case "PENDING":
        return "Pending";
      default:
        return "Processing...";
    }
  };

  const needsProcessing =
    !isPreview &&
    onProcess &&
    (image.status === "PENDING" || image.status === "FAILED");

  return (
    <div
      className={clsx(
        "relative rounded-lg overflow-hidden border-2",
        getBorderColor(),
        "group h-[150px] w-full aspect-square"
      )}
    >
      {/* Status indicator */}
      {!isPreview && (
        <div
          className={clsx(
            "absolute top-2 right-2 h-3 w-3 rounded-full z-10",
            statusColors[currentStatus] ||
              statusColors[image.status] ||
              "bg-yellow-500"
          )}
        />
      )}

      {/* Button overlay - only show on hover */}
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <div className="flex flex-col items-center gap-2">
          {/* Process button - only show for PENDING or FAILED status */}
          {needsProcessing && (
            <button
              onClick={onProcess}
              className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-full transition-colors"
              aria-label="Process image"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
            aria-label="Delete image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="relative h-full w-full">
        {isPreview ? (
          <img
            src={image.preview}
            alt={image.file?.name || "Preview"}
            className="object-cover w-full h-full"
          />
        ) : (
          <img
            src={imageUrl}
            alt={image.originalName || "Image"}
            className="object-cover w-full h-full"
            onError={(e) => {
              console.error("Error loading image:", e);
              e.target.onerror = null;
              e.target.src =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0yNCAxMmMwIDYuNjI3LTUuMzczIDEyLTEyIDEycy0xMi01LjM3My0xMi0xMiA1LjM3My0xMiAxMi0xMiAxMiA1LjM3MyAxMiAxMnptLTEzIDBoLTN2LTFoM3YxeiIvPjwvc3ZnPg==";
            }}
            loading="lazy"
          />
        )}
      </div>

      {/* Rejection overlay for rejected images */}
      {(currentStatus === "rejected" || currentStatus === "FAILED") &&
        !isPreview && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-2 z-10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 mb-1 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs text-center">
              {rejectionReason || "Processing failed"}
            </p>
          </div>
        )}

      {/* Processing overlay */}
      {(currentStatus === "processing" || currentStatus === "PROCESSING") &&
        !isPreview && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="flex flex-col items-center">
              <svg
                className="animate-spin h-8 w-8 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-white text-xs mt-2">Processing...</span>
            </div>
          </div>
        )}

      {/* Upload overlay */}
      {isPreview && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="flex flex-col items-center">
            <svg
              className="animate-spin h-8 w-8 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-white text-xs mt-2">Uploading...</span>
          </div>
        </div>
      )}

      {/* File name and status text */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-1 text-xs">
        <div className="truncate">
          {isPreview
            ? image.file?.name || "Uploading..."
            : image.originalName || "Image"}
        </div>
        <div className="text-xs opacity-75">{getStatusText()}</div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
          <div className="bg-white p-4 rounded-lg shadow-lg max-w-xs w-full">
            <h3 className="text-lg font-semibold mb-2">Delete Image</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete this image? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteModal(false);
                }}
                className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImagePreview;
