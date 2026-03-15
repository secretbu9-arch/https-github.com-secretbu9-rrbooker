import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import LoadingSpinner from '../common/LoadingSpinner';

const WalkInProductPurchase = ({ onClose, onSuccess }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Walk-in Customer',
    phone: '',
    email: '',
    isWalkIn: true
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    fetchProducts();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const productsData = await apiService.getProducts();
      setProducts(productsData || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(10px)',
      zIndex: 1100,
      display: 'flex',
      alignItems: windowWidth < 576 ? 'flex-end' : 'center',
      justifyContent: 'center',
    },
    modal: {
      width: '100%',
      maxWidth: windowWidth < 576 ? '100%' : '1000px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      maxHeight: windowWidth < 576 ? '96vh' : '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    },
    header: {
      padding: '1.5rem',
      borderBottom: '1px solid #f0f0f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    content: {
      padding: '1.5rem',
      overflowY: 'auto',
      flex: 1,
      display: 'flex',
      flexDirection: windowWidth < 992 ? 'column' : 'row',
      gap: '2rem'
    },
    searchBar: {
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      border: 'none',
      backgroundColor: '#f5f5f5',
      fontSize: '0.95rem',
      width: '100%',
      marginBottom: '1rem'
    },
    productCard: {
      display: 'flex',
      alignItems: 'center',
      padding: '1rem',
      backgroundColor: '#fff',
      borderRadius: '20px',
      border: '1px solid #f0f0f0',
      marginBottom: '0.75rem',
      transition: 'all 0.2s',
      cursor: 'pointer'
    },
    cartContainer: {
      backgroundColor: '#f9f9f9',
      borderRadius: '24px',
      padding: '1.5rem',
      flex: windowWidth < 992 ? 'none' : '0 0 320px',
      display: 'flex',
      flexDirection: 'column'
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '1rem',
      borderRadius: '18px',
      fontWeight: '800',
      width: '100%',
      marginTop: '1.5rem',
      boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (selectedCategory === 'all' || p.category === selectedCategory) &&
    p.is_active && p.stock_quantity > 0
  );

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock_quantity) return;
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1, price: product.price }]);
    }
  };

  const updateQuantity = (id, delta) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty > item.stock_quantity) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePurchase = async () => {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: null,
          total_amount: total,
          pickup_date: new Date().toISOString().split('T')[0],
          pickup_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          pickup_location: 'R&R Barber Shop',
          notes: 'Walk-in purchase - immediate pickup',
          customer_phone: customerInfo.phone || 'N/A',
          customer_email: customerInfo.email || 'N/A',
          status: 'picked_up'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        product_name: item.name,
        product_image_url: item.image_url
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      if (onSuccess) onSuccess(order);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {windowWidth < 576 && (
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
          </div>
        )}

        <div style={styles.header}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#888' }}>ADMIN TOOLS</span>
            <h5 style={{ margin: 0, fontWeight: '800' }}>Walk-in Purchase</h5>
          </div>
          <button className="btn-close" onClick={onClose}></button>
        </div>

        <div style={styles.content} className="premium-scroll">
          <div style={{ flex: 1 }}>
            <div className="d-flex gap-2 mb-4">
              <input 
                style={styles.searchBar} 
                placeholder="Find product..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: windowWidth < 768 ? '1fr' : '1fr 1fr', gap: '1rem' }}>
              {filteredProducts.map(p => (
                <div key={p.id} style={styles.productCard} className="hover-lift" onClick={() => addToCart(p)}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '12px', backgroundColor: '#f0f0f0', overflow: 'hidden', marginRight: '1rem' }}>
                    <img src={p.image_url || 'https://via.placeholder.com/64'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>{p.stock_quantity} in stock</div>
                    <div style={{ fontWeight: '800', fontSize: '1rem', color: '#5D4037' }}>₱{p.price.toLocaleString()}</div>
                  </div>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="bi bi-plus" style={{ fontSize: '1.2rem' }}></i>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.cartContainer}>
            <div style={{ fontWeight: '800', fontSize: '1.1rem', marginBottom: '1.5rem' }}>Your Cart</div>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
              {cart.map(item => (
                <div key={item.id} className="d-flex justify-content-between align-items-center mb-3">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>₱{item.price.toLocaleString()} each</div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button className="btn btn-sm p-0" onClick={() => updateQuantity(item.id, -1)}><i className="bi bi-dash-circle text-muted"></i></button>
                    <span style={{ fontWeight: '700', minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                    <button className="btn btn-sm p-0" onClick={() => updateQuantity(item.id, 1)}><i className="bi bi-plus-circle text-muted"></i></button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <div className="text-center text-muted py-5">Cart is empty</div>}
            </div>

            <div className="border-top pt-3">
              <div className="d-flex justify-content-between mb-2">
                <span style={{ color: '#888', fontWeight: '600' }}>Subtotal</span>
                <span style={{ fontWeight: '800' }}>₱{total.toLocaleString()}</span>
              </div>
              <div className="mb-3">
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#888', marginBottom: '4px' }}>CUSTOMER PHONE</label>
                <input 
                  className="form-control rounded-4 border-0 bg-white" 
                  placeholder="Optional"
                  value={customerInfo.phone}
                  onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})}
                  style={{ fontSize: '0.9rem' }}
                />
              </div>
              <button 
                style={styles.primaryBtn} 
                className="touch-btn"
                onClick={handlePurchase}
                disabled={cart.length === 0 || isProcessing}
              >
                {isProcessing ? <span className="spinner-border spinner-border-sm"></span> : 'COMPLETE PURCHASE'}
              </button>
            </div>
          </div>
        </div>

        <style>{`
          .touch-btn:active { transform: scale(0.96); }
          .hover-lift:hover { transform: translateY(-2px); border-color: #1a1a1a; }
          .premium-scroll::-webkit-scrollbar { width: 4px; }
          .premium-scroll::-webkit-scrollbar-thumb { background: #eee; border-radius: 10px; }
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default WalkInProductPurchase;
