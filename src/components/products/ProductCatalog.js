import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useProducts } from '../hooks/useProducts';
import { formatPrice } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';

const ProductCatalog = () => {
  const { addToCart, cart } = useProducts();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    try {
      await addToCart(product, 1);
      alert(`${product.name} added to cart!`);
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add item to cart. Please try again.');
    }
  };

  const getCartQuantity = (productId) => {
    const cartItem = cart.find(item => item.id === productId);
    return cartItem ? cartItem.quantity : 0;
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price_low':
        return a.price - b.price;
      case 'price_high':
        return b.price - a.price;
      case 'newest':
        return new Date(b.created_at) - new Date(a.created_at);
      default:
        return 0;
    }
  });

  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];

  if (loading) {
    return (
      <div className="container py-4">
        <div className="d-flex justify-content-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>Shop Products</h2>
            <Link to="/cart" className="btn btn-primary">
              <i className="bi bi-cart me-2"></i>
              Cart ({cart.length})
            </Link>
          </div>

          {/* Search and Filter Controls */}
          <div className="row mb-4">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.slice(1).map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Sort by Name</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>

          {/* Products Grid */}
          {sortedProducts.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-box display-1 text-muted"></i>
              <h4 className="mt-3">No Products Found</h4>
              <p className="text-muted">
                {searchTerm || selectedCategory !== 'all' 
                  ? 'Try adjusting your search or filter criteria.'
                  : 'No products are available at the moment.'
                }
              </p>
            </div>
          ) : (
            <div className="row">
              {sortedProducts.map((product) => (
                <div key={product.id} className="col-md-6 col-lg-4 mb-4">
                  <div className="card h-100 shadow-sm">
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        className="card-img-top"
                        alt={product.name}
                        style={{ height: '200px', objectFit: 'cover' }}
                      />
                    )}
                    <div className="card-body d-flex flex-column">
                      <h5 className="card-title">{product.name}</h5>
                      <p className="card-text text-muted flex-grow-1">
                        {product.description}
                      </p>
                      <div className="mb-3">
                        <span className="h5 text-primary">
                          {formatPrice(product.price)}
                        </span>
                        {product.category && (
                          <span className="badge bg-secondary ms-2">
                            {product.category}
                          </span>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <Link
                          to={`/products/${product.id}`}
                          className="btn btn-outline-primary flex-fill"
                        >
                          <i className="bi bi-eye me-1"></i>
                          View Details
                        </Link>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleAddToCart(product)}
                          disabled={!product.is_available}
                        >
                          <i className="bi bi-cart-plus me-1"></i>
                          Add to Cart
                        </button>
                      </div>
                      {getCartQuantity(product.id) > 0 && (
                        <div className="mt-2">
                          <small className="text-success">
                            <i className="bi bi-check-circle me-1"></i>
                            {getCartQuantity(product.id)} in cart
                          </small>
                        </div>
                      )}
                      {!product.is_available && (
                        <div className="mt-2">
                          <small className="text-danger">
                            <i className="bi bi-x-circle me-1"></i>
                            Out of stock
                          </small>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCatalog;




