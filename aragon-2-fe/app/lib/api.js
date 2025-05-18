import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const uploadImages = async (files) => {
  const formData = new FormData();

  // Append each file to the formData with the name "images"
  files.forEach((file) => {
    formData.append("images", file);
  });

  try {
    const response = await api.post("/images", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Error uploading images" };
  }
};

export const getImages = async (status, page = 1, limit = 10) => {
  try {
    let url = `/images?page=${page}&limit=${limit}`;
    if (status) {
      url += `&status=${status}`;
    }
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Error fetching images" };
  }
};

export const getImageById = async (id) => {
  try {
    const response = await api.get(`/images/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Error fetching image" };
  }
};

export const deleteImage = async (id) => {
  try {
    const response = await api.delete(`/images/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Error deleting image" };
  }
};

export const processImage = async (id) => {
  try {
    const response = await api.post(`/images/${id}/process`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: "Error processing image" };
  }
};

export default api;
