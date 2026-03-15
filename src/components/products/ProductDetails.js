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
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      
      if (error) throw error;
      if (!data) throw new Error('Product not found');
      
      setProduct(data);
      
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
      setError('Failed to load product details.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      updateCartItem(product.id, existingItem.quantity + quantity);
    } else {
      addToCart(product, quantity);
    }
    setQuantity(1);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container-fluid py-4 min-vh-100" style={{ background: '#fdfdfd', color: '#1a1a1a', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        :root {
          --premium-brown: #3d2c24;
          --bg-card: #ffffff;
          --border-subtle: rgba(0,0,0,0.06);
        }
        .detail-card {
          background: #fff;
          border-radius: 30px;
          border: 1px solid var(--border-subtle);
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.03);
        }
        .img-zoom {
          transition: transform 0.5s ease;
        }
        .img-zoom:hover {
          transform: scale(1.05);
        }
        .rel-card {
          border-radius: 20px;
          border: 1px solid var(--border-subtle);
          transition: 0.3s;
        }
        .rel-card:hover {
          transform: translateY(-5px);
          border-color: var(--premium-brown);
        }
        .btn-premium {
          background: var(--premium-brown);
          color: #fff;
          border: none;
          padding: 14px 28px;
          border-radius: 14px;
          font-weight: 700;
          transition: 0.2s;
        }
        .btn-premium:hover {
          background: #000;
          color: #fff;
        }
        .btn-outline-premium {
          border: 2px solid var(--premium-brown);
          color: var(--premium-brown);
          background: transparent;
          padding: 12px 28px;
          border-radius: 14px;
          font-weight: 700;
        }
      `}</style>

      <div className="container py-lg-5">
        <button onClick={() => navigate('/products')} className="btn btn-link text-dark text-decoration-none fw-bold mb-4 p-0">
          <i className="bi bi-arrow-left me-2"></i> BACK TO SHOP
        </button>

        <div className="detail-card row g-0">
          <div className="col-lg-6 bg-light d-flex align-items-center justify-content-center overflow-hidden" style={{ minHeight: '400px' }}>
            <img 
              src={product.image_url || 'https://via.placeholder.com/600x600'} 
              className="w-100 h-100 object-fit-cover img-zoom" 
              alt={product.name} 
            />
          </div>
          <div className="col-lg-6 p-4 p-md-5 d-flex flex-column">
            <div className="mb-auto">
              <span className="badge rounded-pill bg-dark py-2 px-3 mb-3" style={{ fontSize: '0.7rem', letterSpacing: '1px' }}>{product.category?.toUpperCase() || 'ESSENTIAL'}</span>
              <h1 className="fw-bold display-6 mb-2">{product.name}</h1>
              <p className="text-muted mb-4">{product.description || 'Premium grooming element crafted for style and sustainability.'}</p>
              
              <div className="d-flex align-items-baseline gap-3 mb-4">
                <h2 className="fw-bold mb-0">{formatPrice(product.price)}</h2>
                {product.stock_quantity > 0 ? (
                  <span className="text-success small fw-bold"><i className="bi bi-check2-circle me-1"></i> {product.stock_quantity} IN STOCK</span>
                ) : (
                  <span className="text-danger small fw-bold">OUT OF STOCK</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              {product.stock_quantity > 0 && (
                <>
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <span className="fw-bold small text-muted">QUANTITY</span>
                    <div className="d-flex align-items-center bg-light rounded-pill p-1">
                      <button className="btn btn-sm btn-white rounded-circle shadow-sm" onClick={() => setQuantity(q => Math.max(1, q-1))}>-</button>
                      <span className="px-4 fw-bold">{quantity}</span>
                      <button className="btn btn-sm btn-white rounded-circle shadow-sm" onClick={() => setQuantity(q => Math.min(product.stock_quantity, q+1))}>+</button>
                    </div>
                  </div>
                  <div className="d-flex gap-3">
                    <button className="btn-premium flex-grow-1" onClick={handleAddToCart}>ADD TO BAG</button>
                    <button className="btn-outline-premium" onClick={() => { handleAddToCart(); navigate('/products'); }}>BUY NOW</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Related */}
        {relatedProducts.length > 0 && (
          <div className="mt-5 pt-4">
            <h4 className="fw-bold mb-4">RELATED PRODUCTS</h4>
            <div className="row g-4">
              {relatedProducts.map(rel => (
                <div key={rel.id} className="col-6 col-md-3">
                  <div className="rel-card h-100 p-2 bg-white cursor-pointer" onClick={() => navigate(`/products/${rel.id}`)} style={{ cursor: 'pointer' }}>
                    <img src={rel.image_url || 'https://via.placeholder.com/200x200'} className="w-100 rounded-4 object-fit-cover mb-3" style={{ height: '180px' }} />
                    <div className="px-2">
                       <h6 className="small fw-bold mb-1 text-truncate">{rel.name}</h6>
                       <span className="fw-bold small text-muted">{formatPrice(rel.price)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetails;