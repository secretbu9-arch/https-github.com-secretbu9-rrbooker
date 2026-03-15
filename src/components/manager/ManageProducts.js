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

  // State to handle resize for dynamic styles
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Premium Minimalist Styles - Enhanced for Mobile
  const styles = {
    container: {
      padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    header: {
      display: 'flex',
      flexDirection: windowWidth < 576 ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: windowWidth < 576 ? 'flex-start' : 'center',
      marginBottom: '1.5rem',
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      gap: '1rem'
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: '800',
      color: '#1a1a1a',
      margin: 0,
      letterSpacing: '-0.5px'
    },
    subtitle: {
      color: '#888',
      fontSize: '0.85rem',
      marginTop: '0.2rem'
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '600',
      fontSize: '0.9rem',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      width: windowWidth < 576 ? '100%' : 'auto'
    },
    filterCard: {
      background: '#fff',
      borderRadius: '20px',
      padding: '1rem',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 15px rgba(0,0,0,0.02)',
      border: '1px solid #f0f0f0'
    },
    productGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    },
    productCard: {
      backgroundColor: '#fff',
      borderRadius: '24px',
      padding: '1.25rem',
      boxShadow: '0 8px 25px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: windowWidth < 650 ? 'column' : 'row',
      alignItems: windowWidth < 650 ? 'stretch' : 'center',
      gap: '1.5rem',
      position: 'relative'
    },
    imageContainer: {
      width: windowWidth < 650 ? '100%' : '110px',
      height: windowWidth < 650 ? '180px' : '110px',
      borderRadius: '18px',
      overflow: 'hidden',
      backgroundColor: '#f8f9fa',
      flexShrink: 0
    },
    productImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    detailsColumn: {
      flex: 1,
      minWidth: 0
    },
    quickActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
      marginTop: windowWidth < 650 ? '1rem' : '0'
    },
    stockControl: {
      display: 'flex',
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
      borderRadius: '14px',
      padding: '0.4rem',
      border: '1px solid #eee'
    },
    stockBtn: {
      width: '32px',
      height: '32px',
      borderRadius: '10px',
      border: 'none',
      backgroundColor: '#fff',
      color: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1rem',
      fontWeight: '700',
      boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
      transition: 'all 0.2s ease'
    },
    stockDisplay: {
      minWidth: '50px',
      textAlign: 'center',
      fontWeight: '800',
      fontSize: '1rem',
      color: '#1a1a1a'
    },
    modal: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(8px)',
      padding: '0',
      zIndex: 1050
    },
    modalContent: {
      borderRadius: windowWidth < 576 ? '24px 24px 0 0' : '24px',
      border: '2px solid #000',
      overflow: 'hidden',
      boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
      marginTop: windowWidth < 576 ? 'auto' : '0'
    }
  };

  const handleQuickStockChange = async (product, change) => {
    const newStock = (product.stock_quantity || 0) + change;
    if (newStock < 0) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', product.id);

      if (error) throw error;

      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock_quantity: newStock } : p));
    } catch (err) {
      console.error('Quick stock error:', err);
      setError('Sync failed. Please try again.');
    }
  };

  if (loading && products.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div style={styles.container}>
      {/* Premium Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Manage Products</h2>
          <div style={styles.subtitle}>
            In Stock: <strong>{products.reduce((acc, p) => acc + (p.stock_quantity || 0), 0)} Units</strong> | 
            Catalog: <strong>{products.length} Items</strong>
          </div>
        </div>
        <button
          style={styles.primaryBtn}
          onClick={() => {
            resetForm();
            setShowAddForm(true);
          }}
        >
          <i className="bi bi-plus-lg"></i>
          Add New Product
        </button>
      </div>

      {error && (
        <div className="alert-mobile-custom mb-3 shake" style={{
          backgroundColor: '#fff',
          borderLeft: '4px solid #d32f2f',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
          borderRadius: '16px',
          padding: '1rem',
          color: '#333'
        }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-circle-fill text-danger me-2"></i>
              <span className="small fw-bold">{error}</span>
            </div>
            <button type="button" className="btn-close" style={{fontSize: '0.7rem'}} onClick={() => setError(null)}></button>
          </div>
        </div>
      )}

      {/* Modern Filter Card */}
      <div style={styles.filterCard}>
        <div className="row g-3">
          <div className="col-md-5">
            <div className="position-relative">
              <i className="bi bi-search position-absolute" style={{left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#bbb'}}></i>
              <input
                type="text"
                className="form-control premium-input-style"
                style={{paddingLeft: '2.5rem', borderRadius: '14px', border: '1.5px solid #eee', padding: '0.75rem 1rem 0.75rem 2.5rem'}}
                placeholder="Search catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="col-md-3">
            <select
              className="form-select premium-input-style"
              style={{borderRadius: '14px', border: '1.5px solid #eee', padding: '0.75rem 1rem'}}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((cat, idx) => (
                <option key={idx} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="col-md-4 text-end">
            <div className="btn-group w-100">
              <select
                className="form-select premium-input-style"
                style={{borderRadius: '14px 0 0 14px', border: '1.5px solid #eee', padding: '0.75rem 1rem'}}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort by Name</option>
                <option value="price">Sort by Price</option>
                <option value="stock">Sort by Stock</option>
              </select>
              <button
                className="btn btn-light rounded-e-3 p-3"
                style={{borderRadius: '0 14px 14px 0', border: '1.5px solid #eee', borderLeft: 'none'}}
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              >
                <i className={`bi bi-sort-${sortDirection === 'asc' ? 'down' : 'up'}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product List */}
      <div style={styles.productGrid}>
        {filteredProducts.length === 0 ? (
          <div className="text-center py-5 w-100 bg-white rounded-4 border">
            <i className="bi bi-box-seam text-muted" style={{fontSize: '3rem'}}></i>
            <h5 className="mt-3 text-muted fw-bold">No items found</h5>
            <p className="text-muted small">Update your filters or search query</p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div key={product.id} style={styles.productCard} className="quick-edit-card">
              <div style={styles.imageContainer}>
                <img 
                  src={product.image_url || 'https://placehold.co/400x400?text=No+Image'} 
                  alt={product.name} 
                  style={styles.productImage}
                  onError={handleImageError}
                />
              </div>

              <div style={styles.detailsColumn}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span style={{fontSize: '0.65rem', fontWeight: '800', color: '#888', textTransform: 'uppercase', letterSpacing: '1px'}}>{product.category || 'General'}</span>
                  {!product.is_active && <span className="badge bg-warning text-dark" style={{fontSize: '0.6rem', borderRadius: '4px'}}>DRAFT</span>}
                </div>
                <h5 className="fw-800 mb-1" style={{color: '#1a1a1a'}}>{product.name}</h5>
                <h6 className="fw-700 mb-0" style={{color: '#5D4037'}}>{formatPrice(product.price)}</h6>
              </div>

              <div style={styles.quickActions}>
                {/* Visual Stock Pill */}
                <div style={{...styles.stockControl, backgroundColor: product.stock_quantity < 5 ? '#FFF5F5' : '#F8F9FA'}}>
                  <button className="stock-btn-hover" style={styles.stockBtn} onClick={(e) => { e.stopPropagation(); handleQuickStockChange(product, -1); }}>-</button>
                  <div style={styles.stockDisplay}>{product.stock_quantity}</div>
                  <button className="stock-btn-hover" style={styles.stockBtn} onClick={(e) => { e.stopPropagation(); handleQuickStockChange(product, 1); }}>+</button>
                </div>

                <div className="d-flex gap-2 align-items-center">
                   <button 
                    className="btn btn-dark rounded-4 px-3 py-2 fw-bold" 
                    style={{fontSize: '0.85rem'}}
                    onClick={() => handleEditProduct(product)}
                  >
                    EDIT
                  </button>
                  <div className="dropdown">
                    <button className="btn btn-light rounded-circle touch-btn" data-bs-toggle="dropdown" style={{width: '40px', height: '40px'}}>
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end border-0 shadow-lg p-2" style={{borderRadius: '16px'}}>
                      <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleToggleStatus(product.id, product.is_active)}><i className={`bi bi-eye${product.is_active ? '-slash' : ''} me-2`}></i>{product.is_active ? 'Hide from Shop' : 'Make Visible'}</button></li>
                      <li><hr className="dropdown-divider opacity-50" /></li>
                      <li><button className="dropdown-item rounded-3 py-2 text-danger" onClick={() => handleDeleteProduct(product.id)}><i className="bi bi-trash3-fill me-2"></i>Delete Item</button></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals and Other Logic (unchanged but wrapped in single style block) */}
      
      {showAddForm && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className={`modal-dialog modal-lg ${windowWidth < 576 ? 'm-0 h-100' : 'modal-dialog-centered'}`}>
            <div className="modal-content border-0" style={styles.modalContent}>
              <div className="modal-header border-0 p-4 pb-0">
                <div className="w-100">
                  {windowWidth < 576 && <div className="modal-drag-indicator mb-3 mx-auto"></div>}
                  <h5 className="fw-800 m-0">{editingId ? 'Refine Product' : 'Create New Item'}</h5>
                </div>
                <button type="button" className="btn-close" onClick={resetForm}></button>
              </div>
              <div className="modal-body p-4 scroll-mobile-modal" style={{maxHeight: windowWidth < 576 ? '85vh' : 'auto', overflowY: 'auto'}}>
                <form onSubmit={handleSubmit}>
                  <div className="row g-3">
                    <div className="col-md-12">
                      <div className="form-floating mb-3">
                        <input type="text" className="form-control premium-input" id="name" name="name" placeholder="Product Name" value={formData.name} onChange={handleInputChange} required />
                        <label htmlFor="name">Product Name *</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className="form-control premium-input" id="price" name="price" placeholder="Price" value={formData.price} onChange={handleInputChange} min="0" step="0.01" required />
                        <label htmlFor="price">Price (₱) *</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className="form-control premium-input" id="stock_quantity" name="stock_quantity" placeholder="Initial Stock" value={formData.stock_quantity} onChange={handleInputChange} min="0" required />
                        <label htmlFor="stock_quantity">Initial Stock *</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="text" className="form-control premium-input" id="category" name="category" placeholder="Category" value={formData.category || ''} list="categoryOptions" onChange={handleInputChange} />
                        <label htmlFor="category">Category</label>
                        <datalist id="categoryOptions">
                          {categories.map((c, i) => <option key={i} value={c} />)}
                        </datalist>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="text" className="form-control premium-input" id="image_url" name="image_url" placeholder="Image URL" value={formData.image_url || ''} onChange={handleInputChange} />
                        <label htmlFor="image_url">Image URL</label>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-floating mb-3">
                        <textarea className="form-control premium-input" id="description" name="description" placeholder="Description" style={{height: '100px'}} value={formData.description || ''} onChange={handleInputChange}></textarea>
                        <label htmlFor="description">Product Description</label>
                      </div>
                    </div>
                    <div className="col-12 mb-3">
                      <div className="p-3 rounded-4 bg-light border d-flex align-items-center justify-content-between">
                        <div>
                          <div className="fw-bold">Active Visibility</div>
                          <div className="small text-muted">Show in catalog</div>
                        </div>
                        <div className="form-check form-switch fs-4">
                          <input className="form-check-input custom-switch" type="checkbox" id="is_active" name="is_active" checked={formData.is_active} onChange={handleInputChange} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="d-grid gap-2">
                    <button type="submit" className="btn btn-dark py-3 rounded-4 fw-800 shadow-sm" disabled={saveButtonDisabled}>
                      {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>SYNCING...</> : editingId ? 'UPDATE PRODUCT' : 'LAUNCH PRODUCT'}
                    </button>
                    <button type="button" className="btn btn-link text-muted py-2" onClick={resetForm}>Discard Changes</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDuplicateModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#fff3e0', borderRadius: '20px'}}>
                   <i className="bi bi-exclamation-triangle-fill text-warning fs-2"></i>
                </div>
                <h5 className="fw-800">Duplicate Name</h5>
                <p className="small text-muted">{formData.name} already exists.</p>
                <button className="btn btn-dark w-100 py-3 rounded-pill fw-bold" onClick={() => setShowDuplicateModal(false)}>Got It</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#ffebee', borderRadius: '20px'}}>
                   <i className="bi bi-trash3-fill text-danger fs-2"></i>
                </div>
                <h5 className="fw-800 text-danger">Confirm Deletion</h5>
                <p className="small text-muted mb-4 px-2 italic">Are you sure you want to remove <strong>{productToDelete?.name}</strong>? This is permanent.</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-danger py-3 rounded-pill fw-bold" onClick={confirmDeleteProduct}>Delete Forever</button>
                  <button className="btn btn-link text-muted" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .quick-edit-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.06) !important;
          border-color: #5D403788 !important;
        }
        .stock-btn-hover:hover {
          background-color: #1a1a1a !important;
          color: #fff !important;
        }
        .fw-800 { font-weight: 800; }
        .fw-700 { font-weight: 700; }
        .premium-input {
          border-radius: 16px !important;
          border: 1.5px solid #eee !important;
          background-color: #fcfcfc !important;
        }
        .custom-switch:checked {
          background-color: #5D4037 !important;
          border-color: #5D4037 !important;
        }
        @media (max-width: 575.98px) {
          .modal .modal-dialog {
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: flex-end;
            margin: 0;
            height: 100%;
          }
          .modal.show .modal-dialog { transform: translateY(0); }
        }
        .shake { animation: shake 0.5s; }
        @keyframes shake {
          0%, 100% {transform: translateX(0);}
          10%, 30%, 50%, 70%, 90% {transform: translateX(-5px);}
          20%, 40%, 60%, 80% {transform: translateX(5px);}
        }
      `}</style>
    </div>
  );
};

export default ManageProducts;