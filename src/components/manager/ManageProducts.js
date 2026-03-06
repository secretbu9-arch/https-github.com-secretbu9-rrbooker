// components/manager/ManageProducts.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock_quantity: '',
    image_url: '',
    category: '',
    is_active: true
  });
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [imagePreview, setImagePreview] = useState('');
  const [saveButtonDisabled, setSaveButtonDisabled] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const [productToUpdateStock, setProductToUpdateStock] = useState(null);
  const [stockToAdd, setStockToAdd] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    // Preview image when URL changes
    if (formData.image_url && formData.image_url.trim() !== '') {
      setImagePreview(formData.image_url);
    } else {
      setImagePreview('');
    }
  }, [formData.image_url]);

  // Memoize filtered and sorted products to prevent re-calculating on every keystroke in the form
  const filteredProducts = React.useMemo(() => {
    if (!products.length) return [];

    let filtered = [...products];

    // Apply search filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(query) ||
        (product.description && product.description.toLowerCase().includes(query))
      );
    }

    // Apply category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let valA, valB;

      switch (sortBy) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'price':
          valA = parseFloat(a.price);
          valB = parseFloat(b.price);
          break;
        case 'stock':
          valA = parseInt(a.stock_quantity);
          valB = parseInt(b.stock_quantity);
          break;
        default:
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });

    return filtered;
  }, [products, searchQuery, selectedCategory, sortBy, sortDirection]);

  // Memoize unique categories
  const categories = React.useMemo(() => {
    return [...new Set(products.map(p => p.category).filter(Boolean))];
  }, [products]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) throw error;

      console.log('Fetched products:', data);
      setProducts(data || []);
      // setFilteredProducts(data || []); // Removed, now handled by useMemo

      // Extract unique categories // Removed, now handled by useMemo
      // const uniqueCategories = [...new Set(data.map(product => product.category).filter(Boolean))];
      // setCategories(uniqueCategories);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      stock_quantity: '',
      image_url: '',
      category: '',
      is_active: true
    });
    setImagePreview('');
    setEditingId(null);
    setShowAddForm(false);
    setSaveButtonDisabled(false);
    setShowDuplicateModal(false);
    setDuplicateProduct(null);
    setShowDeleteModal(false);
    setProductToDelete(null);
    setShowStockModal(false);
    setProductToUpdateStock(null);
    setStockToAdd('');
  };

  const handleEditProduct = (product) => {
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      image_url: product.image_url || '',
      category: product.category || '',
      is_active: product.is_active
    });
    setImagePreview(product.image_url || '');
    setEditingId(product.id);
    setShowAddForm(true);

    // Scroll to form
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Validate inputs
      const price = parseFloat(formData.price);
      const stockQuantity = parseInt(formData.stock_quantity);

      if (isNaN(price) || price < 0) {
        setError('Price must be a non-negative number.');
        return;
      }

      if (isNaN(stockQuantity) || stockQuantity < 0) {
        setError('Stock quantity must be a non-negative number.');
        return;
      }

      // Check for duplicate product name (case-insensitive)
      const productNameLower = formData.name.trim().toLowerCase();
      const existingProduct = products.find(p =>
        p.name.trim().toLowerCase() === productNameLower &&
        (!editingId || p.id !== editingId)
      );

      if (existingProduct) {
        setDuplicateProduct(existingProduct);
        setShowDuplicateModal(true);
        return;
      }

      setLoading(true);
      setSaveButtonDisabled(true);
      setError(null);

      // Prepare the data object
      const productData = {
        name: formData.name.trim(),
        description: formData.description,
        price,
        stock_quantity: stockQuantity,
        image_url: formData.image_url,
        category: formData.category,
        is_active: formData.is_active
      };

      console.log('Saving product data:', productData);
      console.log('Editing ID:', editingId);

      // let result; // No longer needed as we handle data directly

      if (editingId) {
        // Update existing product in DB
        const { data: updatedData, error: updateError } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingId)
          .select();

        if (updateError) throw updateError;

        // Update local state instead of refetching everything
        if (updatedData && updatedData[0]) {
          setProducts(prev => prev.map(p => p.id === editingId ? updatedData[0] : p));
        }
      } else {
        // Create new product in DB
        const { data: newData, error: insertError } = await supabase
          .from('products')
          .insert([productData])
          .select();

        if (insertError) throw insertError;

        // Add to local state
        if (newData && newData[0]) {
          setProducts(prev => [newData[0], ...prev]);
        }
      }

      // Reset form on success (no refetch needed!)
      resetForm();

    } catch (err) {
      console.error('Error saving product:', err);
      setError(`Failed to ${editingId ? 'update' : 'create'} product. Please try again later.`);
    } finally {
      setLoading(false);
      setSaveButtonDisabled(false);
    }
  };

  const handleToggleStatus = async (productId, currentStatus) => {
    try {
      setLoading(true);
      setError(null);

      // Toggle the active status
      const { error } = await supabase
        .from('products')
        .update({
          is_active: !currentStatus
        })
        .eq('id', productId);

      if (error) throw error;

      // Update the local state
      setProducts(prevProducts =>
        prevProducts.map(product =>
          product.id === productId
            ? { ...product, is_active: !currentStatus }
            : product
        )
      );

      // Log the action
      const product = products.find(p => p.id === productId);
      await supabase.from('system_logs').insert([{
        action: 'product_status_changed',
        details: {
          product_name: product?.name,
          product_id: productId,
          new_status: !currentStatus ? 'active' : 'inactive'
        }
      }]);

    } catch (err) {
      console.error('Error toggling product status:', err);
      setError('Failed to update product status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = (productId) => {
    const product = products.find(p => p.id === productId);
    setProductToDelete(product);
    setShowDeleteModal(true);
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;

    try {
      setLoading(true);
      setError(null);

      // Delete the product
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id);

      if (error) throw error;

      // Update local state
      setProducts(prevProducts => prevProducts.filter(p => p.id !== productToDelete.id));

      // Log the action
      await supabase.from('system_logs').insert([{
        action: 'product_deleted',
        details: {
          product_name: productToDelete?.name,
          product_id: productToDelete.id
        }
      }]);

      // Close modal
      setShowDeleteModal(false);
      setProductToDelete(null);

    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Failed to delete product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = (product) => {
    setProductToUpdateStock(product);
    setStockToAdd('10'); // Default value
    setShowStockModal(true);
  };

  const confirmAddStock = async () => {
    if (!productToUpdateStock) return;

    const quantityToAdd = parseInt(stockToAdd);
    if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
      setError('Please enter a valid positive number.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const newStock = (productToUpdateStock.stock_quantity || 0) + quantityToAdd;

      // Update stock
      const { error } = await supabase
        .from('products')
        .update({
          stock_quantity: newStock
        })
        .eq('id', productToUpdateStock.id);

      if (error) throw error;

      // Update the local state
      setProducts(prevProducts =>
        prevProducts.map(product =>
          product.id === productToUpdateStock.id
            ? { ...product, stock_quantity: newStock }
            : product
        )
      );

      // Log the action
      await supabase.from('system_logs').insert([{
        action: 'product_stock_updated',
        details: {
          product_name: productToUpdateStock.name,
          product_id: productToUpdateStock.id,
          added_quantity: quantityToAdd,
          new_stock: newStock
        }
      }]);

      // Close modal
      setShowStockModal(false);
      setProductToUpdateStock(null);
      setStockToAdd('');

    } catch (err) {
      console.error('Error updating stock:', err);
      setError('Failed to update stock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(price);
  };

  const getStockStatusClass = (quantity) => {
    if (quantity <= 0) return 'danger';
    if (quantity < 10) return 'warning';
    return 'success';
  };

  const handleImageError = (e) => {
    console.log('Image failed to load:', e.target.src);
    e.target.src = 'https://placehold.co/200x200?text=No+Image';
    e.target.onerror = null; // Prevent infinite loop
  };

  if (loading && products.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
        <h2 className="mb-0 fw-bold">Manage Products</h2>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button
            type="button"
            className="btn-close"
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Search, Filter, and Add */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setSearchQuery('')}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>
            </div>

            <div className="col-md-2">
              <select
                className="form-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.map((category, index) => (
                  <option key={index} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <div className="input-group">
                <select
                  className="form-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="name">Sort by Name</option>
                  <option value="price">Sort by Price</option>
                  <option value="stock">Sort by Stock</option>
                </select>
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                >
                  <i className={`bi bi-sort-${sortDirection === 'asc' ? 'down' : 'up'}`}></i>
                </button>
              </div>
            </div>

            <div className="col-md-3 text-end">
              <button
                className="btn btn-primary w-100"
                onClick={() => {
                  resetForm();
                  setShowAddForm(!showAddForm);
                }}
              >
                <i className={`bi ${showAddForm ? 'bi-dash' : 'bi-plus'}`}></i>
                {showAddForm ? 'Cancel' : 'Add New Product'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">{editingId ? 'Edit Product' : 'Add New Product'}</h5>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="name" className="form-label">Product Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label htmlFor="price" className="form-label">Price (₱) *</label>
                  <input
                    type="number"
                    className="form-control"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label htmlFor="stock_quantity" className="form-label">Stock Quantity *</label>
                  <input
                    type="number"
                    className="form-control"
                    id="stock_quantity"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleInputChange}
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="category" className="form-label">Category</label>
                  <input
                    type="text"
                    className="form-control"
                    id="category"
                    name="category"
                    value={formData.category || ''}
                    onChange={handleInputChange}
                    list="categoryOptions"
                  />
                  <datalist id="categoryOptions">
                    {categories.map((category, index) => (
                      <option key={index} value={category} />
                    ))}
                  </datalist>
                </div>
                <div className="col-md-6 mb-3">
                  <label htmlFor="image_url" className="form-label">Image URL</label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      id="image_url"
                      name="image_url"
                      value={formData.image_url || ''}
                      onChange={handleInputChange}
                      placeholder="https://example.com/image.jpg"
                    />
                    {formData.image_url && (
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => {
                          const url = formData.image_url;
                          if (url) window.open(url, '_blank');
                        }}
                      >
                        <i className="bi bi-box-arrow-up-right"></i>
                      </button>
                    )}
                  </div>
                  <div className="form-text">Paste a direct URL to an image (JPG, PNG, etc.)</div>

                  {/* Image Preview */}
                  {imagePreview && (
                    <div className="mt-2 text-center">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="img-thumbnail"
                        style={{ maxHeight: '100px' }}
                        onError={handleImageError}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="description" className="form-label">Description</label>
                <textarea
                  className="form-control"
                  id="description"
                  name="description"
                  value={formData.description || ''}
                  onChange={handleInputChange}
                  rows="3"
                ></textarea>
              </div>

              <div className="mb-3 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="is_active"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                />
                <label className="form-check-label" htmlFor="is_active">Active</label>
                <small className="form-text text-muted d-block">
                  Inactive products won't be visible to customers.
                </small>
              </div>

              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveButtonDisabled}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    <>Save Product</>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={resetForm}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Product Modal */}
      {showDuplicateModal && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDuplicateModal(false);
              setDuplicateProduct(null);
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  Duplicate Product Name
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setDuplicateProduct(null);
                  }}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  A product with the name <strong>"{formData.name}"</strong> already exists.
                </p>
                {duplicateProduct && (
                  <div className="alert alert-info">
                    <strong>Existing Product:</strong>
                    <ul className="mb-0 mt-2">
                      <li>Name: {duplicateProduct.name}</li>
                      <li>Price: {formatPrice(duplicateProduct.price)}</li>
                      <li>Category: {duplicateProduct.category || '—'}</li>
                      <li>Stock: {duplicateProduct.stock_quantity}</li>
                    </ul>
                  </div>
                )}
                <p className="text-muted mb-0">
                  Please use a different name for this product.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setDuplicateProduct(null);
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && productToDelete && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteModal(false);
              setProductToDelete(null);
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  Confirm Deletion
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setProductToDelete(null);
                  }}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  Are you sure you want to delete <strong>"{productToDelete.name}"</strong>?
                </p>
                <div className="alert alert-warning">
                  <strong>Warning:</strong> This action cannot be undone. All product data will be permanently deleted.
                </div>
                {productToDelete && (
                  <div className="alert alert-info">
                    <strong>Product Details:</strong>
                    <ul className="mb-0 mt-2">
                      <li>Name: {productToDelete.name}</li>
                      <li>Price: {formatPrice(productToDelete.price)}</li>
                      <li>Category: {productToDelete.category || '—'}</li>
                      <li>Stock: {productToDelete.stock_quantity}</li>
                    </ul>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setProductToDelete(null);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDeleteProduct}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-trash me-2"></i>
                      Delete Product
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showStockModal && productToUpdateStock && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowStockModal(false);
              setProductToUpdateStock(null);
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <i className="bi bi-box-fill me-2"></i>
                  Add Stock: {productToUpdateStock.name}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setShowStockModal(false);
                    setProductToUpdateStock(null);
                  }}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="mb-4 text-center">
                  <div className="display-6 fw-bold text-success mb-2">
                    {productToUpdateStock.stock_quantity || 0}
                  </div>
                  <div className="text-muted small text-uppercase ls-1">Current Stock</div>
                </div>

                <div className="form-group mb-3">
                  <label htmlFor="stockToAdd" className="form-label fw-semibold">Quantity to Add</label>
                  <div className="input-group input-group-lg">
                    <span className="input-group-text bg-light border-end-0">
                      <i className="bi bi-plus-lg text-success"></i>
                    </span>
                    <input
                      type="number"
                      id="stockToAdd"
                      className="form-control bg-light border-start-0 ps-0"
                      value={stockToAdd}
                      onChange={(e) => setStockToAdd(e.target.value)}
                      min="1"
                      placeholder="Enter quantity"
                      autoFocus
                    />
                  </div>
                  <div className="form-text mt-2">
                    New total will be: <span className="fw-bold text-dark">{(productToUpdateStock.stock_quantity || 0) + (parseInt(stockToAdd) || 0)}</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light border-top-0 px-4 py-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4"
                  onClick={() => {
                    setShowStockModal(false);
                    setProductToUpdateStock(null);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success px-4"
                  onClick={confirmAddStock}
                  disabled={loading || !stockToAdd || parseInt(stockToAdd) <= 0}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Updating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle me-2"></i>
                      Confirm Add
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products List */}
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">All Products</h5>
          <span className="badge bg-primary">{filteredProducts.length} products</span>
        </div>
        <div className="card-body">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted">
                {searchQuery || selectedCategory !== 'all'
                  ? 'No products found matching your filters.'
                  : 'No products available. Add your first product using the button above.'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className={!product.is_active ? 'table-secondary' : ''}>
                      <td>
                        <div className="d-flex align-items-center">
                          <div className="me-3">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                                className="rounded"
                                onError={handleImageError}
                              />
                            ) : (
                              <div className="bg-light rounded d-flex align-items-center justify-content-center" style={{ width: '50px', height: '50px' }}>
                                <i className="bi bi-box-seam"></i>
                              </div>
                            )}
                          </div>
                          <div>
                            <strong>{product.name}</strong>
                            {product.description && (
                              <div className="small text-muted">{product.description.substring(0, 50)}{product.description.length > 50 ? '...' : ''}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {product.category ? (
                          <span className="badge bg-info">{product.category}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="currency-table-cell">{formatPrice(product.price)}</td>
                      <td>
                        <span className={`badge bg-${getStockStatusClass(product.stock_quantity)}`}>
                          {product.stock_quantity} in stock
                        </span>
                      </td>
                      <td>
                        <div className="btn-group" role="group">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEditProduct(product)}
                            title="Edit"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleAddStock(product)}
                            title="Add Stock"
                          >
                            <i className="bi bi-plus-circle"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDeleteProduct(product.id)}
                            title="Delete"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageProducts;