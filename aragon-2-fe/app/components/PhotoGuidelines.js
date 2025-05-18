"use client";

import React, { useState } from "react";
import clsx from "clsx";

const GuidelineSection = ({
  title,
  icon,
  isOpen,
  onClick,
  children,
  isSuccess = true,
}) => {
  return (
    <div className="mb-4 bg-white rounded-lg border border-gray-100 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              "rounded-full p-1",
              isSuccess ? "bg-green-100" : "bg-red-100"
            )}
          >
            {icon}
          </div>
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={clsx(
            "h-5 w-5 text-gray-500 transition-transform",
            isOpen ? "transform rotate-180" : ""
          )}
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

      {isOpen && (
        <div className="p-4 pt-0 border-t border-gray-100">{children}</div>
      )}
    </div>
  );
};

const PhotoGuidelines = () => {
  const [openSection, setOpenSection] = useState(null);

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="my-6">
      <GuidelineSection
        title="Photo Requirements"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        }
        isOpen={openSection === "requirements"}
        onClick={() => toggleSection("requirements")}
        isSuccess={true}
      >
        <ul className="list-disc pl-5 space-y-2 text-gray-600">
          <li>Minimum resolution: 800x800 pixels</li>
          <li>Minimum file size: 50KB</li>
          <li>Formats: JPG, PNG, HEIC</li>
          <li>Photos should be clear and in focus</li>
          <li>Your face should be clearly visible and well-lit</li>
          <li>
            A mix of close-ups, selfies, and mid-range shots is recommended
          </li>
        </ul>
      </GuidelineSection>

      <GuidelineSection
        title="Photo Restrictions"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-red-600"
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
        }
        isOpen={openSection === "restrictions"}
        onClick={() => toggleSection("restrictions")}
        isSuccess={false}
      >
        <ul className="list-disc pl-5 space-y-2 text-gray-600">
          <li>No blurry photos</li>
          <li>No photos with multiple people/faces</li>
          <li>No photos where your face is too small in the frame</li>
          <li>No duplicate or very similar photos</li>
          <li>No heavily filtered or edited photos</li>
          <li>Maximum file size: 10MB</li>
        </ul>
      </GuidelineSection>
    </div>
  );
};

export default PhotoGuidelines;
