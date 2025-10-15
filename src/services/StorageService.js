// services/StorageService.js
import { supabase } from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for handling file uploads and storage with Supabase storage
 */
class StorageService {
  /**
   * Upload an image to Supabase Storage
   * @param {File} file - The file to upload
   * @param {string} bucket - The storage bucket to use
   * @param {string} folder - The folder to store the file in
   * @returns {Promise<string>} - URL of the uploaded file
   */
  async uploadImage(file, bucket = 'images', folder = 'uploads') {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      // Generate a unique file name to avoid conflicts
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${uuidv4()}.${fileExt}`;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Upload a profile picture
   * @param {File} file - The profile image file
   * @param {string} userId - User ID
   * @returns {Promise<string>} - URL of the uploaded profile picture
   */
  async uploadProfilePicture(file, userId) {
    return this.uploadImage(file, 'profiles', `user_${userId}`);
  }

  /**
   * Upload a product image
   * @param {File} file - The product image file
   * @returns {Promise<string>} - URL of the uploaded product image
   */
  async uploadProductImage(file) {
    return this.uploadImage(file, 'products', 'product_images');
  }

  /**
   * Upload a face image for haircut recommendation
   * @param {File} file - The face image file
   * @param {string} userId - User ID
   * @returns {Promise<string>} - URL of the uploaded face image
   */
  async uploadFaceImage(file, userId) {
    return this.uploadImage(file, 'faces', `user_${userId}`);
  }

  /**
   * Delete a file from Supabase Storage
   * @param {string} url - The URL of the file to delete
   * @param {string} bucket - The storage bucket
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(url, bucket = 'images') {
    try {
      if (!url) {
        throw new Error('No URL provided');
      }

      // Extract the file path from the URL
      const urlObj = new URL(url);
      const path = urlObj.pathname.split('/').slice(-2).join('/');

      const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Replace an existing file with a new one
   * @param {File} file - The new file
   * @param {string} oldUrl - URL of the file to replace
   * @param {string} bucket - The storage bucket
   * @param {string} folder - The folder to store the file in
   * @returns {Promise<string>} - URL of the new file
   */
  async replaceFile(file, oldUrl, bucket = 'images', folder = 'uploads') {
    try {
      // Delete the old file if a URL is provided
      if (oldUrl) {
        await this.deleteFile(oldUrl, bucket);
      }

      // Upload the new file
      return await this.uploadImage(file, bucket, folder);
    } catch (error) {
      console.error('Error replacing file:', error);
      throw error;
    }
  }

  /**
   * Generate a data URL from a file (for preview)
   * @param {File} file - The file to create a data URL for
   * @returns {Promise<string>} - Data URL
   */
  async getDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Get a temporary download URL for a file
   * @param {string} path - File path in storage
   * @param {string} bucket - Storage bucket
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<string>} - Temporary URL
   */
  async getTemporaryUrl(path, bucket = 'images', expiresIn = 60) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  }
}

// Export singleton instance
export const storageService = new StorageService();