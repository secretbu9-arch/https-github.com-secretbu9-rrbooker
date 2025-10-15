// components/products/ProductDetails.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useProducts } from '../hooks/useProducts';
import { formatPrice } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';

const ProductDetails = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart, updateCartItem, cart } = useProducts();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState([]);

  useEffect(() => {
    fetchProductDetails();
  }, [productId]);

  const fetchProductDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch product details
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      
      if (error) throw error;
      
      if (!data) {
        throw new Error('Product not found');
      }
      
      setProduct(data);
      
      // Fetch related products (products in the same category)
      if (data.category) {
        const { data: relatedData, error: relatedError } = await supabase
          .from('products')
          .select('*')
          .eq('category', data.category)
          .eq('is_active', true)
          .neq('id', productId)
          .order('name')
          .limit(4);
        
        if (relatedError) throw relatedError;
        
        setRelatedProducts(relatedData || []);
      }
      
    } catch (error) {
      console.error('Error fetching product details:', error);
      setError('Failed to load product details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value);
    if (value > 0 && value <= product.stock_quantity) {
      setQuantity(value);
    }
  };

  const incrementQuantity = () => {
    if (quantity < product.stock_quantity) {
      setQuantity(prev => prev + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    
    // Find if product is already in cart
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
      // Update quantity if already in cart
      updateCartItem(product.id, existingItem.quantity + quantity);
    } else {
      // Add new item to cart
      addToCart(product, quantity);
    }
    
    // Show confirmation and reset quantity
    alert(`Added ${quantity} ${product.name} to your cart.`);
    setQuantity(1);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    navigate('/cart');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !product) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">
          {error || 'Product not found'}
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/products')}
        >
          Back to Products
        </button>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="mb-4">
        <button 
          className="btn btn-outline-secondary" 
          onClick={() => navigate('/products')}
        >
          <i className="bi bi-arrow-left me-2"></i>
          Back to Products
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="row">
            {/* Product Image */}
            <div className="col-md-5 mb-4 mb-md-0">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  className="img-fluid rounded"
                  alt={product.name}
                />
              ) : (
                <div 
                  className="bg-light d-flex align-items-center justify-content-center rounded"
                  style={{ height: '300px' }}
                >
                  <i className="bi bi-image text-muted fs-1"></i>
                </div>
              )}
            </div>
            
            {/* Product Details */}
            <div className="col-md-7">
              {product.category && (
                <div className="mb-2">
                  <span className="badge bg-primary">{product.category}</span>
                </div>
              )}
              
              <h2 className="mb-3">{product.name}</h2>
              
              <h3 className="text-primary mb-3">
                {formatPrice(product.price)}
              </h3>
              
              <div className="mb-4">
                <p>{product.description || 'No description available.'}</p>
              </div>
              
              <div className="mb-4">
                <div className={`alert ${product.stock_quantity > 0 ? 'alert-success' : 'alert-danger'}`}>
                  {product.stock_quantity > 0 ? (
                    <>
                      <i className="bi bi-check-circle me-2"></i>
                      In Stock ({product.stock_quantity} available)
                    </>
                  ) : (
                    <>
                      <i className="bi bi-x-circle me-2"></i>
                      Out of Stock
                    </>
                  )}
                </div>
              </div>
              
              {product.stock_quantity > 0 && (
                <div className="mb-4">
                  <label htmlFor="quantity" className="form-label">Quantity</label>
                  <div className="input-group">
                    <button 
                      className="btn btn-outline-secondary" 
                      type="button"
                      onClick={decrementQuantity}
                    >
                      <i className="bi bi-dash"></i>
                    </button>
                    
                    <input
                      type="number"
                      className="form-control text-center"
                      id="quantity"
                      value={quantity}
                      onChange={handleQuantityChange}
                      min="1"
                      max={product.stock_quantity}
                    />
                    
                    <button 
                      className="btn btn-outline-secondary" 
                      type="button"
                      onClick={incrementQuantity}
                    >
                      <i className="bi bi-plus"></i>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="d-grid gap-2 d-md-flex">
                <button
                  className="btn btn-primary btn-lg flex-grow-1"
                  disabled={product.stock_quantity <= 0}
                  onClick={handleAddToCart}
                >
                  <i className="bi bi-cart-plus me-2"></i>
                  Add to Cart
                </button>
                
                <button
                  className="btn btn-success btn-lg flex-grow-1"
                  disabled={product.stock_quantity <= 0}
                  onClick={handleBuyNow}
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-4">Related Products</h3>
          
          <div className="row row-cols-2 row-cols-md-4 g-4">
            {relatedProducts.map(relatedProduct => (
              <div key={relatedProduct.id} className="col">
                <div 
                  className="card h-100 cursor-pointer"
                  onClick={() => navigate(`/products/${relatedProduct.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {relatedProduct.image_url ? (
                    <img 
                      src={relatedProduct.image_url} 
                      className="card-img-top" 
                      alt={relatedProduct.name}
                      style={{ height: '160px', objectFit: 'cover' }}
                    />
                  ) : (
                    <div 
                      className="bg-light d-flex align-items-center justify-content-center"
                      style={{ height: '160px' }}
                    >
                      <i className="bi bi-image text-muted fs-1"></i>
                    </div>
                  )}
                  
                  <div className="card-body">
                    <h6 className="card-title">{relatedProduct.name}</h6>
                    <p className="card-text text-primary">{formatPrice(relatedProduct.price)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetails;