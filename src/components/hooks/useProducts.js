// hooks/useProducts.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import { storageService } from '../../services/StorageService';

/**
 * Custom hook for managing products
 * @param {boolean} includeInactive - Whether to include inactive products
 * @param {boolean} autoFetch - Whether to fetch products automatically on mount
 */
export const useProducts = (includeInactive = false, autoFetch = true) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);

  /**
   * Fetch all products
   */
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.getProducts(includeInactive);
      setProducts(data);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  /**
   * Get a product by ID
   * @param {string} productId - ID of the product to get
   * @returns {Promise<object>} - The product data
   */
  const getProductById = async (productId) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.getProductById(productId);
      return data;
    } catch (err) {
      console.error('Error getting product:', err);
      setError('Failed to get product details. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a new product
   * @param {object} productData - Product data
   * @param {File} imageFile - Product image file
   * @returns {Promise<object>} - Result of the operation
   */
  const createProduct = async (productData, imageFile) => {
    try {
      setLoading(true);
      setError(null);
      
      // Upload image if provided
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await storageService.uploadProductImage(imageFile);
      }
      
      // Create product with image URL
      const data = await apiService.createProduct({
        ...productData,
        image_url: imageUrl,
        is_active: true
      });
      
      // Update local state
      setProducts(prev => [data, ...prev]);
      
      return { success: true, data };
    } catch (err) {
      console.error('Error creating product:', err);
      setError('Failed to create product. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update an existing product
   * @param {string} productId - ID of the product to update
   * @param {object} updates - Data to update
   * @param {File} imageFile - New product image file
   * @returns {Promise<object>} - Result of the operation
   */
  const updateProduct = async (productId, updates, imageFile) => {
    try {
      setLoading(true);
      setError(null);
      
      // Find product to get current image URL
      const currentProduct = products.find(p => p.id === productId);
      
      // Upload image if provided
      if (imageFile) {
        updates.image_url = await storageService.replaceFile(
          imageFile, 
          currentProduct?.image_url,
          'products',
          'product_images'
        );
      }
      
      const data = await apiService.updateProduct(productId, updates);
      
      // Update local state
      setProducts(prev => 
        prev.map(product => product.id === productId ? { ...product, ...data } : product)
      );
      
      return { success: true, data };
    } catch (err) {
      console.error('Error updating product:', err);
      setError('Failed to update product. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delete a product
   * @param {string} productId - ID of the product to delete
   * @returns {Promise<object>} - Result of the operation
   */
  const deleteProduct = async (productId) => {
    try {
      setLoading(true);
      setError(null);
      
      // Find product to get image URL
      const product = products.find(p => p.id === productId);
      
      // Delete product
      await apiService.deleteProduct(productId);
      
      // Delete product image if exists
      if (product?.image_url) {
        await storageService.deleteFile(product.image_url, 'products');
      }
      
      // Update local state
      setProducts(prev => prev.filter(product => product.id !== productId));
      
      return { success: true };
    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Failed to delete product. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add product to cart
   * @param {object} product - Product to add
   * @param {number} quantity - Quantity to add
   */
  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      // Check if product already exists in cart
      const existingProductIndex = prev.findIndex(item => item.id === product.id);
      
      if (existingProductIndex >= 0) {
        // Update quantity if product exists
        const updatedCart = [...prev];
        updatedCart[existingProductIndex] = {
          ...updatedCart[existingProductIndex],
          quantity: updatedCart[existingProductIndex].quantity + quantity
        };
        return updatedCart;
      } else {
        // Add new product to cart
        return [...prev, { ...product, quantity }];
      }
    });
    
    // Save cart to localStorage
    saveCartToStorage();
  };

  /**
   * Update product quantity in cart
   * @param {string} productId - ID of the product to update
   * @param {number} quantity - New quantity
   */
  const updateCartItem = (productId, quantity) => {
    setCart(prev => {
      if (quantity <= 0) {
        // Remove item if quantity is zero or negative
        return prev.filter(item => item.id !== productId);
      } else {
        // Update quantity
        return prev.map(item => 
          item.id === productId 
            ? { ...item, quantity } 
            : item
        );
      }
    });
    
    // Save cart to localStorage
    saveCartToStorage();
  };

  /**
   * Remove product from cart
   * @param {string} productId - ID of the product to remove
   */
  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
    
    // Save cart to localStorage
    saveCartToStorage();
  };

  /**
   * Clear the cart
   */
  const clearCart = () => {
    setCart([]);
    
    // Clear cart from localStorage
    localStorage.removeItem('cart');
  };

  /**
   * Calculate cart total
   * @returns {number} - Cart total
   */
  const calculateCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  /**
   * Save cart to localStorage
   */
  const saveCartToStorage = () => {
    localStorage.setItem('cart', JSON.stringify(cart));
  };

  /**
   * Load cart from localStorage
   */
  const loadCartFromStorage = () => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error('Error parsing cart from localStorage:', error);
        localStorage.removeItem('cart');
      }
    }
  };

  // Initial fetch on mount if autoFetch is true
  useEffect(() => {
    if (autoFetch) {
      fetchProducts();
    }
    
    // Load cart from localStorage
    loadCartFromStorage();
  }, [autoFetch, fetchProducts]);

  // Set up subscription for product changes (for managers)
  useEffect(() => {
    // Get the current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      
      // Set up subscription for product changes
      const subscription = supabase
        .channel('products-changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'products'
          }, 
          () => {
            // Refetch products when changes occur
            fetchProducts();
          }
        )
        .subscribe();
      
      // Return cleanup function
      return () => {
        subscription.unsubscribe();
      };
    });
  }, [fetchProducts]);

  return {
    products,
    loading,
    error,
    fetchProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    calculateCartTotal
  };
};