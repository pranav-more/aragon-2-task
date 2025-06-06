"use client";

import React, { useState, useEffect } from "react";
import ImagePreview from "./ImagePreview";
import { prefetchImages } from "../lib/imageUtils";

const ImageGallery = ({
  images,
  title,
  emptyMessage = "No images to display",
  onDelete,
  onProcess = null,
  status,
  pagination = null, // Keep for backward compatibility but we won't use it
  isLoading = false,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [loadedImages, setLoadedImages] = useState([]);

  // Prefetch images when the images array changes
  useEffect(() => {
    if (!images || images.length === 0) {
      setLoadedImages([]);
      return;
    }

    setIsPrefetching(true);

    // Set initial state with the images
    setLoadedImages(images);

    // Prefetch the images in the background
    prefetchImages(images).finally(() => {
      setIsPrefetching(false);
    });
  }, [images]);

  if (!images || images.length === 0) {
    return null;
  }

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <section className="mb-8">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800">
              {title} {images.length > 0 && `(${images.length})`}
            </h3>
            {isPrefetching && (
              <div className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
            )}
          </div>
          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={toggleExpanded}
            aria-label={expanded ? "Collapse section" : "Expand section"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {expanded && (
          <>
            <div
              className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 ${
                images.length > 8
                  ? "max-h-[600px] overflow-y-auto pr-2 custom-scrollbar"
                  : ""
              }`}
            >
              {isLoading
                ? // Loading placeholders
                  Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`placeholder-${index}`}
                      className="bg-gray-200 animate-pulse rounded-lg aspect-square"
                    />
                  ))
                : // Actual images
                  loadedImages.map((image) => (
                    <ImagePreview
                      key={image.id}
                      image={image}
                      status={status || image.status}
                      onDelete={() => onDelete(image.id)}
                      onProcess={onProcess ? () => onProcess(image.id) : null}
                    />
                  ))}
            </div>

            {/* Pagination removed - all images are now displayed in a scrollable container */}
          </>
        )}
      </div>
    </section>
  );
};

export default ImageGallery;
