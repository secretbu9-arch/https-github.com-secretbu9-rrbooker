// components/customer/HaircutRecommender.js (Simple manual face-shape selection system)
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

// Import face shape images
import roundShape from '../../assets/images/face-shapes/Round.png';
import diamondShape from '../../assets/images/face-shapes/Diamond.png';
import oblongShape from '../../assets/images/face-shapes/Oblong.png';
import rectangleShape from '../../assets/images/face-shapes/Rectangle.png';
import triangleShape from '../../assets/images/face-shapes/Triangle.png';
import ovalShape from '../../assets/images/face-shapes/Oval.png';

// Import haircut images from assets
import frenchCropImg from '../../assets/images/haircuts/french-crop.jpg';
import shortMulletImg from '../../assets/images/haircuts/short-mullet.jpg';
import burstFadeImg from '../../assets/images/haircuts/burst-fade.jpg';
import commaHairImg from '../../assets/images/haircuts/comma-hair.jpg.jpg';
import diamondCrewCutImg from '../../assets/images/haircuts/diamond-crew-cut.jpg';
import wolfCutImg from '../../assets/images/haircuts/wolf-cut.jpg';
import lowTaperImg from '../../assets/images/haircuts/low-taper.jpg';
import sidePartImg from '../../assets/images/haircuts/side-part.jpg';
import fringeImg from '../../assets/images/haircuts/fringe.jpg';
import highFadeImg from '../../assets/images/haircuts/high-fade.jpg';
import undercutImg from '../../assets/images/haircuts/undercut.jpg';
import warriorImg from '../../assets/images/haircuts/warrior.jpg';
import quiffsImg from '../../assets/images/haircuts/quiffs.png';
import edgarImg from '../../assets/images/haircuts/edgar.jpg';
import texturedFringeImg from '../../assets/images/haircuts/textured-fringe.webp';
import curtainImg from '../../assets/images/haircuts/curtain-bangs-haircut.webp';
import lowFadeImg from '../../assets/images/haircuts/low-fade.webp';
import longTrimImg from '../../assets/images/haircuts/long-trim.jpg';
import middlePartImg from '../../assets/images/haircuts/middle-part.jpg';
import warriorBuzzCutImg from '../../assets/images/haircuts/warrior-buzz-cut.jpg';
import commaCutImg from '../../assets/images/haircuts/comma-cut.jpg';
import modernSpikeImg from '../../assets/images/haircuts/modern-spike.webp';
import buzzCutImg from '../../assets/images/haircuts/buzz-cut.jpg';

const faceShapeImages = {
  Round: roundShape,
  Diamond: diamondShape,
  Oblong: oblongShape,
  Rectangle: rectangleShape,
  Triangle: triangleShape,
  Oval: ovalShape
};

const HaircutRecommender = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [faceShape, setFaceShape] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previousRecommendations, setPreviousRecommendations] = useState([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [animateItems, setAnimateItems] = useState(false);
  const [hoveredShape, setHoveredShape] = useState('');
  const [imageScale, setImageScale] = useState(0.4);
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedModalImage, setSelectedModalImage] = useState(null);
  const [selectedModalTitle, setSelectedModalTitle] = useState('');
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const cameraOverlayRef = useRef(null);
  const imageContainerRef = useRef(null);
  const cameraContainerRef = useRef(null);
  const rafRef = useRef(null);
  const preloadedImages = useRef({});

  const haircutImages = {
    'french-crop': frenchCropImg,
    'mullet': shortMulletImg,
    'burst-fade': burstFadeImg,
    'comma-hair': commaHairImg,
    'diamond-crew-cut': diamondCrewCutImg,
    'wolf-cut': wolfCutImg,
    'low-taper': lowTaperImg,
    '70-30-hair': sidePartImg,
    'fringe': fringeImg,
    'side-part': sidePartImg,
    'blowout-taper': highFadeImg,
    'undercut': undercutImg,
    'slicked-back': warriorImg,
    'quiffs': quiffsImg,
    'short-mullet': shortMulletImg,
    'edgar': edgarImg,
    'textured-fringe': texturedFringeImg,
    'curtain': curtainImg,
    'low-fade': lowFadeImg,
    'long-trim': longTrimImg,
    'middle-part': middlePartImg,
    'warrior-buzz-cut': warriorBuzzCutImg,
    'warrior-cut': warriorImg,
    'comma-cut': commaCutImg,
    'modern-spike': modernSpikeImg,
    'slick-back': warriorImg,
    'buzz-cut': buzzCutImg,
    'high-fade': highFadeImg
  };

  const getRecommendationsByFaceShape = (shape) => {
    const baseRecommendations = {
      'Oval': [
        { name: 'French Crop', description: 'Short, textured top with longer fringe that can be styled forward or swept to the side. Balanced and versatile.', difficulty: 'Low', maintenance: 'Low', tags: ['Modern', 'Versatile'], image: haircutImages['french-crop'] },
        { name: 'Classic Mullet', description: 'Short on top and sides with longer length at the back. Adds unique personality and style.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Trendy', 'Statement'], image: haircutImages['mullet'] },
        { name: 'Burst Fade', description: 'Circular fade pattern around the ears and neckline, giving a sharp, distinctive look.', difficulty: 'High', maintenance: 'High', tags: ['Sharp', 'Precision'], image: haircutImages['burst-fade'] }
      ],
      'Diamond': [
        { name: 'Diamond Crew Cut', description: 'Clean, structured lines that complement high cheekbones and a narrow forehead.', difficulty: 'Low', maintenance: 'Low', tags: ['Classic', 'Professional'], image: haircutImages['diamond-crew-cut'] },
        { name: 'Wolf Cut', description: 'Layered texture with volume that helps soften angular features and looks trendy.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Trendy', 'Textured'], image: haircutImages['wolf-cut'] },
        { name: '70/30 Side Part', description: 'Asymmetrical styling that creates visual balance and sophisticated appeal.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Sophisticated', 'Balanced'], image: haircutImages['70-30-hair'] }
      ],
      'Round': [
        { name: 'Side Part', description: 'Creates vertical emphasis to elongate the face shape and add sophistication.', difficulty: 'Low', maintenance: 'Low', tags: ['Classic', 'Elongating'], image: haircutImages['side-part'] },
        { name: 'Blowout Taper', description: 'High volume on top with short sides to add length and reduce width visually.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Stylish', 'Voluminous'], image: haircutImages['blowout-taper'] },
        { name: 'Slicked Back', description: 'Provides height and structure, creating a formal yet bold silhouette.', difficulty: 'Medium', maintenance: 'High', tags: ['Bold', 'Formal'], image: haircutImages['slicked-back'] }
      ],
      'Triangle': [
        { name: 'Short Mullet', description: 'Adds width to the upper face to balance a wider jawline. Modern and edgy.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Edgy', 'Balancing'], image: haircutImages['short-mullet'] },
        { name: 'Edgar Cut', description: 'Sharp fringe lines that contrast well with triangular features for a bold look.', difficulty: 'High', maintenance: 'High', tags: ['Sharp', 'Bold'], image: haircutImages['edgar'] },
        { name: 'Textured Fringe', description: 'Soft layers that add volume to the forehead area and soften the jaw.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Natural', 'Textured'], image: haircutImages['textured-fringe'] }
      ],
      'Rectangle': [
        { name: 'Long Trim', description: 'Softens a strong jawline with length and natural movement. Very versatile.', difficulty: 'Low', maintenance: 'Medium', tags: ['Natural', 'Versatile'], image: haircutImages['long-trim'] },
        { name: 'Middle Part', description: 'Adds symmetry and softness to the overall facial structure. A timeless choice.', difficulty: 'Low', maintenance: 'Low', tags: ['Timeless', 'Symmetrical'], image: haircutImages['middle-part'] },
        { name: 'Warrior Buzz Cut', description: 'Short and masculine, highlights strong features without over-complicating.', difficulty: 'Low', maintenance: 'Low', tags: ['Masculine', 'Bold'], image: haircutImages['warrior-buzz-cut'] }
      ],
      'Oblong': [
        { name: 'Modern Spike', description: 'Adds texture without excessive height to avoid over-elongating the face.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Modern', 'Textured'], image: haircutImages['modern-spike'] },
        { name: 'Classic Slick Back', description: 'Smooth, polished look that provides width and sophistication.', difficulty: 'Medium', maintenance: 'High', tags: ['Polished', 'Sophisticated'], image: haircutImages['slick-back'] },
        { name: 'Low Fade Brush Up', description: 'Balanced volume that maintains proportions while looking contemporary.', difficulty: 'Medium', maintenance: 'Medium', tags: ['Contemporary', 'Balanced'], image: haircutImages['high-fade'] }
      ]
    };
    return baseRecommendations[shape] || baseRecommendations['Oval'];
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    fetchPreviousRecommendations();
    setTimeout(() => setAnimateItems(true), 300);
    preloadFaceShapeImages();
    return () => {
      stopCamera();
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    if (selectedImage && (faceShape || hoveredShape)) {
      drawFaceShapeOverlay(hoveredShape || faceShape);
    }
  }, [overlayPosition, imageScale, selectedImage, faceShape, hoveredShape]);

  const preloadFaceShapeImages = () => {
    Object.keys(faceShapeImages).forEach(shape => {
      const img = new Image();
      img.onload = () => { preloadedImages.current[shape] = img; };
      img.src = faceShapeImages[shape];
    });
  };

  const fetchPreviousRecommendations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: allAppointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('customer_id', user.id)
        .not('notes', 'is', null)
        .ilike('notes', '%HAIRCUT RECOMMENDATION%')
        .order('created_at', { ascending: false })
        .limit(6);

      if (allAppointments) {
        setPreviousRecommendations(allAppointments.map(apt => {
          const notes = apt.notes || '';
          const lines = notes.split('\n');
          return {
            id: apt.id,
            style: lines.find(l => l.startsWith('Style:'))?.replace('Style:', '').trim() || 'Custom Style',
            description: lines.find(l => l.startsWith('Description:'))?.replace('Description:', '').trim() || '',
            faceShape: lines.find(l => l.startsWith('Face Shape:'))?.replace('Face Shape:', '').trim() || 'Unknown',
            createdAt: apt.created_at
          };
        }));
      }
    } catch (e) { console.error('Error fetching history:', e); }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const targetAR = 9 / 16;
          let cw, ch, cx, cy;
          if (img.width / img.height > targetAR) {
            ch = img.height; cw = img.height * targetAR; cx = (img.width - cw) / 2; cy = 0;
          } else {
            cw = img.width; ch = img.width / targetAR; cx = 0; cy = (img.height - ch) / 2;
          }
          canvas.width = 360; canvas.height = 640;
          ctx.drawImage(img, cx, cy, cw, ch, 0, 0, 360, 640);
          setSelectedImage(canvas.toDataURL('image/jpeg', 0.9));
          setFaceShape('');
          setRecommendations([]);
          setOverlayPosition({ x: 0, y: 0 });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const switchToCamera = async () => {
    try {
      // Clear any existing error
      setError('');
      
      // Use more flexible constraints for desktop cameras to ensure centered center-feeds
      const constraints = { 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraReady(true);
        startCameraLoop();
      }
    } catch (err) { 
      console.error('Camera switching error:', err);
      setError('Camera access failed. Please ensure you have granted permission.'); 
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsCameraReady(false);
  };

  const startCameraLoop = () => {
    const draw = () => {
      if (!cameraOverlayRef.current || !cameraContainerRef.current) return;
      const ctx = cameraOverlayRef.current.getContext('2d');
      const box = cameraContainerRef.current.getBoundingClientRect();
      cameraOverlayRef.current.width = box.width;
      cameraOverlayRef.current.height = box.height;
      ctx.clearRect(0, 0, box.width, box.height);
      const activeShape = hoveredShape || faceShape || 'Oval';
      const img = preloadedImages.current[activeShape];
      if (img) {
        const scale = 0.5 * box.width / img.width;
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, (box.width - w) / 2, (box.height - h) / 2, w, h);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  };

  const takePicture = () => {
    if (videoRef.current && imageContainerRef.current) {
      const video = videoRef.current;
      const container = imageContainerRef.current;
      const canvas = document.createElement('canvas');
      
      // 1. Get exact container dimensions for the "what you see is what you get" frame
      const rect = container.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      
      if (vw === 0 || vh === 0) return;

      // 2. Use a high-quality multiplier for sharp recommendations
      const qualityMultiplier = 2; // Fixed high-res multiplier
      const targetWidth = rect.width * qualityMultiplier;
      const targetHeight = rect.height * qualityMultiplier;
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      // 3. Precise Centered Crop Logic (matches object-fit: cover)
      const targetAR = targetWidth / targetHeight;
      const videoAR = vw / vh;
      
      let sx, sy, sw, sh;
      if (videoAR > targetAR) {
        // Video is wider than the target frame (common on desktop)
        sh = vh;
        sw = vh * targetAR;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        // Video is taller than the target frame (common on mobile)
        sw = vw;
        sh = vw / targetAR;
        sx = 0;
        sy = (vh - sh) / 2;
      }
      
      // 4. Mirroring and Drawing
      // Apply translation first, then scale to mirror horizontally
      ctx.save();
      ctx.translate(targetWidth, 0);
      ctx.scale(-1, 1);
      
      // Set smoothing for better quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Use floored integers for source coordinates to prevent sub-pixel shifting bugs
      ctx.drawImage(
        video, 
        Math.floor(sx), Math.floor(sy), Math.floor(sw), Math.floor(sh), 
        0, 0, targetWidth, targetHeight
      );
      ctx.restore();
      
      // 5. Cleanup and UI Update
      setSelectedImage(canvas.toDataURL('image/jpeg', 0.95));
      stopCamera();
      setActiveTab('upload');
      
      // Reset position to center for the new capture
      setOverlayPosition({ x: 0, y: 0 });
    }
  };

  const drawFaceShapeOverlay = (shape) => {
    if (!overlayCanvasRef.current || !imageContainerRef.current) return;
    const ctx = overlayCanvasRef.current.getContext('2d');
    const box = imageContainerRef.current.getBoundingClientRect();
    overlayCanvasRef.current.width = box.width;
    overlayCanvasRef.current.height = box.height;
    ctx.clearRect(0, 0, box.width, box.height);
    const img = preloadedImages.current[shape];
    if (img) {
      const w = img.width * imageScale * (box.width / 360);
      const h = img.height * imageScale * (box.width / 360);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(img, (box.width - w) / 2 + overlayPosition.x, (box.height - h) / 2 + overlayPosition.y, w, h);
    }
  };

  const handleSelectShape = async (shape) => {
    if (!selectedImage) { setError('Upload or take photo first.'); return; }
    setLoading(true); setFaceShape(shape);
    const recs = getRecommendationsByFaceShape(shape);
    setRecommendations(recs);
    setLoading(false);
  };

  const startDrag = (e) => {
    setIsDragging(true);
    const x = e.clientX || e.touches?.[0]?.clientX;
    const y = e.clientY || e.touches?.[0]?.clientY;
    setDragStart({ x: x - overlayPosition.x, y: y - overlayPosition.y });
  };
  const onDrag = (e) => {
    if (!isDragging) return;
    const x = e.clientX || e.touches?.[0]?.clientX;
    const y = e.clientY || e.touches?.[0]?.clientY;
    setOverlayPosition({ x: x - dragStart.x, y: y - dragStart.y });
  };

  return (
    <div className="container-fluid py-4 min-vh-100" style={{ background: '#fdfdfd', color: '#1a1a1a', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        
        :root {
          --brown-premium: #3d2c24;
          --brown-light: #5d4a41;
          --bg-card: #ffffff;
          --text-muted: #666666;
          --border-subtle: rgba(0,0,0,0.06);
        }

        .premium-btn {
          background: var(--brown-premium);
          border: none;
          color: white;
          border-radius: 30px;
          padding: 10px 24px;
          font-weight: 600;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(61, 44, 36, 0.15);
        }

        .premium-btn:hover {
          background: #000;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        .recommender-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.04);
          overflow: hidden;
        }

        .shape-btn {
          background: #f8f8f8;
          border: 1px solid transparent;
          border-radius: 12px;
          color: #444;
          padding: 12px;
          transition: all 0.2s ease;
          width: 100%;
        }

        .shape-btn:hover {
          background: #fff;
          border-color: var(--brown-premium);
          color: var(--brown-premium);
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }

        .shape-btn.active {
          background: var(--brown-premium);
          border-color: var(--brown-premium);
          color: #fff;
          transform: scale(1.02);
        }

        .animate-up { animation: fadeInUp 0.6s ease forwards; }
        .animate-down { animation: fadeInDown 0.6s ease forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-15px); } to { opacity: 1; transform: translateY(0); } }

        .image-container { position: relative; border-radius: 16px; overflow: hidden; background: #fff; border: 1px solid var(--border-subtle); cursor: move; }
        .scale-slider { accent-color: var(--brown-premium); }
        .rec-item { background: #fff; border: 1px solid var(--border-subtle); border-radius: 16px; transition: all 0.3s ease; }
        .rec-item:hover { transform: translateX(5px); box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-color: var(--brown-premium); }
        .details-panel { background: #ffffff; border-left: 1px solid var(--border-subtle); box-shadow: -10px 0 50px rgba(0,0,0,0.05); }
        .tab-pill { background: #f0f0f0; padding: 4px; border-radius: 50px; }
        .tab-btn { border: none; background: transparent; color: #666; font-size: 0.85rem; font-weight: 600; padding: 6px 20px; border-radius: 50px; transition: all 0.2s; }
        .tab-btn.active { background: #fff; color: #1a1a1a; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .text-white-50 { color: #888 !important; }
        .uppercase { text-transform: uppercase; letter-spacing: 1px; }
        .extra-small { font-size: 0.75rem; }
        .scale-x-n1 { transform: scaleX(-1); }
      `}</style>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 animate-down">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-white rounded-circle p-2 d-flex align-items-center justify-content-center shadow-sm" style={{ width: '45px', height: '45px', border: '1px solid #eee' }}>
            <img src={logoImage} alt="Raf & Rok" style={{ width: '32px' }} />
          </div>
          <h4 className="mb-0 fw-bold" style={{ color: '#1a1a1a' }}>Haircut Recommender</h4>
        </div>
        <Link to="/customer-dashboard" className="btn btn-outline-dark rounded-pill px-4 small fw-bold">Dashboard</Link>
      </div>

      <div className="row g-4">
        {/* Main Interface */}
        <div className="col-12 col-lg-7">
          <div className="recommender-card p-4 h-100 animate-up">
            <div className="d-flex gap-2 mb-4 tab-pill" style={{ width: 'fit-content' }}>
              <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => { stopCamera(); setActiveTab('upload'); }}>Upload</button>
              <button className={`tab-btn ${activeTab === 'camera' ? 'active' : ''}`} onClick={() => { switchToCamera(); setActiveTab('camera'); }}>Camera</button>
            </div>

            <div className="row g-4">
              <div className="col-md-5">
                <div className="image-container" 
                  ref={imageContainerRef} 
                  onMouseDown={startDrag} onMouseMove={onDrag} onMouseUp={() => setIsDragging(false)}
                  onTouchStart={startDrag} onTouchMove={onDrag} onTouchEnd={() => setIsDragging(false)}
                  style={{ height: '450px' }}>
                  
                  {activeTab === 'upload' ? (
                    selectedImage ? (
                      <img src={selectedImage} alt="Portrait" className="w-100 h-100 object-fit-cover" />
                    ) : (
                      <label className="w-100 h-100 d-flex flex-column align-items-center justify-content-center gap-2 cursor-pointer bg-light rounded-4">
                        <i className="bi bi-cloud-arrow-up display-5 text-muted"></i>
                        <span className="small fw-bold text-muted">Upload Photo</span>
                        <input type="file" className="d-none" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    )
                  ) : (
                    <div className="position-relative w-100 h-100" ref={cameraContainerRef}>
                      <video ref={videoRef} autoPlay playsInline muted className="w-100 h-100 object-fit-cover scale-x-n1" />
                      <canvas ref={cameraOverlayRef} className="position-absolute top-0 start-0 w-100 h-100 scale-x-n1" />
                      <div className="position-absolute bottom-0 start-0 w-100 p-3 text-center">
                        <button className="btn btn-dark rounded-circle p-3 shadow-lg" onClick={takePicture} style={{ width: '64px', height: '64px' }}>
                          <i className="bi bi-camera-fill text-white fs-4"></i>
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedImage && <canvas ref={overlayCanvasRef} className="position-absolute top-0 start-0 w-100 h-100 pointer-events-none" />}
                </div>

                {selectedImage && activeTab === 'upload' && (
                  <div className="mt-3 text-center">
                    <p className="extra-small text-muted mb-1 fw-bold">OVERLAY SCALE</p>
                    <input type="range" className="w-100 scale-slider mb-2" min="0.2" max="0.8" step="0.05" value={imageScale} onChange={(e) => setImageScale(parseFloat(e.target.value))} />
                    <button className="btn btn-outline-dark btn-sm rounded-pill extra-small px-3 fw-bold" onClick={() => setOverlayPosition({ x: 0, y: 0 })}>Reset Position</button>
                  </div>
                )}
              </div>

              <div className="col-md-7 ps-md-4">
                <h6 className="fw-bold mb-3 text-muted small uppercase">Define Face Shape</h6>
                <div className="row g-2">
                  {['Oval', 'Round', 'Diamond', 'Triangle', 'Rectangle', 'Oblong'].map(shape => (
                    <div key={shape} className="col-6">
                      <button 
                        className={`shape-btn ${faceShape === shape ? 'active' : ''}`}
                        onClick={() => handleSelectShape(shape)}
                        onMouseEnter={() => setHoveredShape(shape)}
                        onMouseLeave={() => setHoveredShape('')}
                      >
                        <div className="fw-bold fs-6">{shape}</div>
                      </button>
                    </div>
                  ))}
                </div>
                {loading && <div className="mt-4 text-center text-white-50 small"><div className="spinner-border spinner-border-sm me-2"></div>Analyzing Style...</div>}
                
                {error && <div className="mt-3 p-3 bg-danger bg-opacity-10 border border-danger border-opacity-20 rounded-4 text-danger small text-center">{error}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Style Recommendations Sidebar */}
        <div className="col-12 col-lg-5">
          <div className="recommender-card p-4 h-100 animate-up" style={{ animationDelay: '0.1s' }}>
            <h6 className="fw-bold mb-4 text-white-50 small uppercase pb-2 border-bottom border-secondary border-opacity-25">Recommended Styles</h6>
            
            {recommendations.length > 0 ? (
              <div className="d-flex flex-column gap-3">
                {recommendations.map((rec, i) => (
                  <div key={i} className="rec-item p-3 shadow-hover" style={{ cursor: 'pointer' }} onClick={() => { setSelectedRecommendation(rec); setShowDetailsPanel(true); }}>
                    <div className="d-flex gap-3 align-items-center">
                      <img src={rec.image} alt={rec.name} className="rounded-4 object-fit-cover" style={{ width: '80px', height: '80px', border: '1px solid #eee' }} />
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <h6 className="mb-0 fw-bold">{rec.name}</h6>
                          {i === 0 && <span className="badge bg-dark text-white rounded-pill px-2" style={{ fontSize: '0.65rem' }}>Top Pick</span>}
                        </div>
                        <p className="text-muted extra-small mb-0 line-clamp-2">{rec.description}</p>
                      </div>
                      <i className="bi bi-chevron-right text-muted"></i>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-100 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="bi bi-person-badge display-4 mb-3 opacity-25"></i>
                <p className="small text-center px-4 fw-medium">Upload a photo or select a face shape to view personalized recommendations</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History Section */}
      {previousRecommendations.length > 0 && (
        <div className="mt-5 animate-up" style={{ animationDelay: '0.2s' }}>
          <h6 className="fw-bold mb-4 text-muted small uppercase">Recently Recommended</h6>
          <div className="row g-3">
            {previousRecommendations.map(prev => (
              <div key={prev.id} className="col-12 col-md-4">
                <div className="recommender-card p-3 shadow-sm" style={{ background: '#fff' }}>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <span className="fw-bold text-dark">{prev.style}</span>
                    <span className="text-muted extra-small">{new Date(prev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    <span className="badge bg-light text-dark border rounded-pill px-2 extra-small">{prev.faceShape}</span>
                    <Link to="/book" className="ms-auto text-decoration-none extra-small text-dark fw-bold hover-underline" style={{ borderBottom: '1px solid #ddd' }} onClick={() => {
                        localStorage.setItem('selectedHaircutStyle', JSON.stringify({ name: prev.style, description: prev.description, faceShape: prev.faceShape }));
                      }}>Book Again</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side Detail Panel */}
      {showDetailsPanel && selectedRecommendation && (
        <>
          <div className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-40" style={{ zIndex: 1050, backdropFilter: 'blur(4px)' }} onClick={() => setShowDetailsPanel(false)}></div>
          <div className="details-panel position-fixed top-0 end-0 h-100 p-0 shadow-lg" style={{ width: isMobile ? '100%' : '450px', zIndex: 1060 }}>
            <div className="p-4 h-100 d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
                <h5 className="mb-0 fw-bold">Style Details</h5>
                <button className="btn btn-light rounded-circle p-1" style={{ width: '32px', height: '32px' }} onClick={() => setShowDetailsPanel(false)}><i className="bi bi-x-lg"></i></button>
              </div>
              
              <div className="overflow-auto flex-grow-1 pe-2">
                <img src={selectedRecommendation.image} alt={selectedRecommendation.name} className="w-100 rounded-4 shadow-sm mb-4 object-fit-cover" style={{ height: '320px' }} />
                <h3 className="fw-bold mb-2 text-dark">{selectedRecommendation.name}</h3>
                <p className="text-muted mb-4 lh-lg" style={{ fontSize: '0.95rem' }}>{selectedRecommendation.description}</p>
                
                <div className="row g-3 mb-5">
                  <div className="col-6">
                    <div className="p-3 rounded-4 bg-light border border-white shadow-sm">
                      <p className="text-muted extra-small uppercase mb-1 fw-bold">Maintenance</p>
                      <span className="fw-bold text-dark">{selectedRecommendation.maintenance}</span>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-3 rounded-4 bg-light border border-white shadow-sm">
                      <p className="text-muted extra-small uppercase mb-1 fw-bold">Difficulty</p>
                      <span className="fw-bold text-dark">{selectedRecommendation.difficulty}</span>
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2 mb-5">
                  {selectedRecommendation.tags?.map(t => <span key={t} className="badge rounded-pill bg-dark text-white px-3 py-2" style={{ fontWeight: '500' }}>{t}</span>)}
                </div>
              </div>

              <Link to="/book" className="premium-btn w-100 text-center text-decoration-none py-3 mt-auto fs-5 fw-bold" style={{ borderRadius: '16px' }} onClick={() => {
                const styleData = {
                  name: selectedRecommendation.name,
                  description: selectedRecommendation.description,
                  faceShape: faceShape,
                  bookingNote: `HAIRCUT RECOMMENDATION:\nStyle: ${selectedRecommendation.name}\nFace Shape: ${faceShape}`
                };
                localStorage.setItem('selectedHaircutStyle', JSON.stringify(styleData));
                localStorage.setItem('specialRequest', styleData.bookingNote);
              }}>Book This Look</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HaircutRecommender;