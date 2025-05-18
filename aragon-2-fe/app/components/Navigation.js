"use client";

import React from "react";
import Header from "./Header";
import BackButton from "./BackButton";

const Navigation = ({ onBackClick }) => {
  return (
    <div className="mb-10">
      <Header />
      <div className="mt-6">
        <BackButton onClick={onBackClick} />
      </div>
    </div>
  );
};

export default Navigation;
