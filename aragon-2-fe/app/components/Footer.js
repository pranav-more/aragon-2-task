"use client";

import React from "react";
import Button from "./Button";

const Footer = ({
  photoCount,
  onContinue,
  minRequiredPhotos = 6,
  isVisible = false,
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-md">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">{photoCount} photos ready</p>
        </div>
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
};

export default Footer;
