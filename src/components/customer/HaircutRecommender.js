// components/customer/HaircutRecommender.js (Simple manual face-shape selection system)
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

// Import face shape images (Method 1: Individual imports)
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

// Face shape overlay images
const faceShapeImages = {
  Round: roundShape,
  Diamond: diamondShape,
  Oblong: oblongShape,
  Rectangle: rectangleShape,
  Triangle: triangleShape,
  Oval: ovalShape
};

// Professional face shape drawing function with accurate outlines
function drawFaceSilhouette(ctx, centerX, centerY, faceWidth, faceHeight, ratios, shape) {
  const topY = centerY - faceHeight / 2;
  const chinY = centerY + faceHeight / 2;

  const foreheadHalf = (faceWidth / 2) * (ratios.forehead || 0.85);
  const cheekHalf = (faceWidth / 2) * (ratios.cheek || 1.0);
  const jawHalf = (faceWidth / 2) * (ratios.jaw || 0.75);

  // Define key points for different face shapes
  const templeY = topY + faceHeight * 0.20;
  const cheekY = topY + faceHeight * 0.50;
  const jawY = topY + faceHeight * 0.80;

  ctx.beginPath();

  // Draw shape-specific outlines for the 6 required shapes
  switch(shape) {
    case 'Round':
      // Perfect circle - equal width and height, truly round
      const radius = Math.min(faceWidth, faceHeight) / 2;
      ctx.ellipse(centerX, centerY, radius, radius, 0, 0, 2 * Math.PI);
      break;

    case 'Diamond':
      // Diamond shape exactly as shown in reference image
      ctx.moveTo(centerX, topY);
      // Right side - narrow forehead to wide cheekbones to narrow chin
      ctx.lineTo(centerX + foreheadHalf * 0.6, templeY);
      ctx.lineTo(centerX + cheekHalf * 1.1, cheekY);
      ctx.lineTo(centerX + jawHalf * 0.5, jawY);
      ctx.lineTo(centerX, chinY);
      // Left side - mirror the right side
      ctx.lineTo(centerX - jawHalf * 0.5, jawY);
      ctx.lineTo(centerX - cheekHalf * 1.1, cheekY);
      ctx.lineTo(centerX - foreheadHalf * 0.6, templeY);
      ctx.closePath();
      break;

    case 'Oblong':
      // Elongated oval - longer than wide, straight sides
      ctx.moveTo(centerX - foreheadHalf, topY);
      ctx.lineTo(centerX + foreheadHalf, topY);
      ctx.lineTo(centerX + cheekHalf, cheekY);
      ctx.lineTo(centerX + jawHalf, jawY);
      ctx.lineTo(centerX + jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, jawY);
      ctx.lineTo(centerX - cheekHalf, cheekY);
      ctx.closePath();
      break;

    case 'Rectangle':
      // Strong angular jawline, uniform width
      ctx.moveTo(centerX - foreheadHalf, topY);
      ctx.lineTo(centerX + foreheadHalf, topY);
      ctx.lineTo(centerX + jawHalf, jawY);
      ctx.lineTo(centerX + jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, jawY);
      ctx.closePath();
      break;

    case 'Triangle':
      // Narrow forehead, wide jaw - inverted triangle
  ctx.moveTo(centerX, topY);
      ctx.lineTo(centerX + foreheadHalf * 0.5, templeY);
      ctx.lineTo(centerX + cheekHalf * 0.8, cheekY);
      ctx.lineTo(centerX + jawHalf, jawY);
      ctx.lineTo(centerX + jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, chinY);
      ctx.lineTo(centerX - jawHalf, jawY);
      ctx.lineTo(centerX - cheekHalf * 0.8, cheekY);
      ctx.lineTo(centerX - foreheadHalf * 0.5, templeY);
  ctx.closePath();
      break;

    case 'Oval':
      // Egg-shaped - wider forehead than jaw, smooth curves
      ctx.ellipse(centerX, centerY, faceWidth/2, faceHeight/2, 0, 0, 2 * Math.PI);
      break;

    default:
      // Default oval shape
      ctx.ellipse(centerX, centerY, faceWidth/2, faceHeight/2, 0, 0, 2 * Math.PI);
  }
}

// Professional face shape profiles for the 6 required shapes
function getShapeProfile(shape) {
  const professional = {
    Round:    { widthScale: 1.00, heightScale: 1.00, ratios: { forehead: 1.00, cheek: 1.00, jaw: 1.00 } },
    Diamond:  { widthScale: 0.90, heightScale: 1.10, ratios: { forehead: 0.65, cheek: 1.25, jaw: 0.55 } },
    Oblong:   { widthScale: 0.80, heightScale: 1.25, ratios: { forehead: 0.95, cheek: 0.90, jaw: 0.85 } },
    Rectangle:{ widthScale: 0.85, heightScale: 1.20, ratios: { forehead: 1.00, cheek: 1.00, jaw: 1.00 } },
    Triangle: { widthScale: 0.95, heightScale: 1.05, ratios: { forehead: 0.75, cheek: 0.95, jaw: 1.15 } },
    Oval:     { widthScale: 0.85, heightScale: 1.15, ratios: { forehead: 0.90, cheek: 1.00, jaw: 0.85 } }
  };
  return professional[shape] || professional.Oval;
}

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
  const [imageScale, setImageScale] = useState(0.3); // Image size control - adjustable overlay
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 }); // Overlay position
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedModalImage, setSelectedModalImage] = useState(null);
  const [selectedModalTitle, setSelectedModalTitle] = useState('');
  const [selectedFaceShapeFilter, setSelectedFaceShapeFilter] = useState('all');

  const videoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const imageRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const cameraOverlayRef = useRef(null);
  const imageContainerRef = useRef(null);
  const cameraContainerRef = useRef(null);
  const rafRef = useRef(null);
  const preloadedImages = useRef({});
  // Refs for camera overlay loop to read freshest values
  const faceShapeRef = useRef('');
  const hoveredShapeRef = useRef('');

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const width = window.innerWidth;
      const userAgent = navigator.userAgent;
      const mobile = width < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      setIsMobile(mobile);
    };
    
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

  // Redraw overlay when position or scale changes (for real-time dragging and sizing)
  useEffect(() => {
    if (selectedImage && (faceShape || hoveredShape)) {
      const shapeToDraw = hoveredShape || faceShape;
      drawFaceShapeOverlay(shapeToDraw);
    }
  }, [overlayPosition, imageScale, selectedImage, faceShape, hoveredShape]);

  // Preload face shape images
  const preloadFaceShapeImages = () => {
    Object.keys(faceShapeImages).forEach(shape => {
      const img = new Image();
      img.onload = () => {
        preloadedImages.current[shape] = img;
        // Log original image dimensions for debugging
        console.log(`${shape} image loaded:`, {
          width: img.naturalWidth,
          height: img.naturalHeight,
          src: img.src
        });
      };
      img.src = faceShapeImages[shape];
    });
  };

  // Redraw overlay whenever hovered shape, selected face shape, or image changes
  useEffect(() => {
    const activeShape = hoveredShape || faceShape;
    if (selectedImage && activeShape) {
      drawFaceShapeOverlay(activeShape);
    } else {
      clearOverlay();
    }
  }, [hoveredShape, faceShape, selectedImage]);

  // Keep refs in sync for live camera overlay loop
  useEffect(() => { faceShapeRef.current = faceShape; }, [faceShape]);
  useEffect(() => { hoveredShapeRef.current = hoveredShape; }, [hoveredShape]);

  const fetchPreviousRecommendations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;


      // Fetch appointments with haircut recommendations in notes
      const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select('*')
        .eq('customer_id', user.id)
        .not('notes', 'is', null)
        .ilike('notes', '%HAIRCUT RECOMMENDATION%')
        .order('created_at', { ascending: false })
        .limit(10);

      if (allError) {
        console.error('Error fetching appointments:', allError);
        return;
      }

      // Get unique barber IDs and fetch their names from users table
      const barberIds = [...new Set(allAppointments?.map(apt => apt.barber_id).filter(Boolean) || [])];
      const { data: barbers, error: barbersError } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'barber')
        .in('id', barberIds);

      if (barbersError) {
        console.error('Error fetching barbers:', barbersError);
      }

      // Create a map of barber ID to name
      const barberMap = {};
      if (barbers) {
        barbers.forEach(barber => {
          barberMap[barber.id] = barber.full_name;
        });
      }

      const data = allAppointments || [];

      // Parse haircut recommendations from appointment notes
      const parsedRecommendations = (data || [])
        .filter(appointment => {
          const notes = appointment.notes || '';
          // Only include appointments that have proper haircut recommendation format
          return notes.includes('HAIRCUT RECOMMENDATION') && 
                 (notes.includes('Style:') || notes.includes('Description:'));
        })
        .map(appointment => {
          const notes = appointment.notes || '';
          
          const lines = notes.split('\n');
          const styleLine = lines.find(line => line.startsWith('Style:'));
          const descriptionLine = lines.find(line => line.startsWith('Description:'));
          const faceShapeLine = lines.find(line => line.startsWith('Face Shape:'));
          
          // Extract structured data
          const style = styleLine ? styleLine.replace('Style:', '').trim() : 'Unknown Style';
          const description = descriptionLine ? descriptionLine.replace('Description:', '').trim() : 'No description available';
          const faceShape = faceShapeLine ? faceShapeLine.replace('Face Shape:', '').trim() : 'Unknown';
          
          return {
            id: appointment.id,
            style,
            description,
            faceShape,
            appointmentDate: appointment.appointment_date,
            createdAt: appointment.created_at,
            barberName: barberMap[appointment.barber_id] || appointment.barber_name || 'Unknown Barber'
          };
        });

      setPreviousRecommendations(parsedRecommendations);
    } catch (error) {
      console.error('Error fetching previous recommendations:', error);
      setPreviousRecommendations([]);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Crop image to 9:16 aspect ratio
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set canvas to 9:16 aspect ratio
          const targetAspectRatio = 9 / 16;
          let cropWidth, cropHeight, cropX, cropY;
          
          if (img.width / img.height > targetAspectRatio) {
            // Image is wider than target ratio, crop width
            cropHeight = img.height;
            cropWidth = img.height * targetAspectRatio;
            cropX = (img.width - cropWidth) / 2;
            cropY = 0;
          } else {
            // Image is taller than target ratio, crop height
            cropWidth = img.width;
            cropHeight = img.width / targetAspectRatio;
            cropX = 0;
            cropY = (img.height - cropHeight) / 2;
          }
          
          // Set canvas size to 9:16
          canvas.width = 360; // 9 * 40
          canvas.height = 640; // 16 * 40
          
          // Draw cropped image
          ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
          
          setSelectedImage(canvas.toDataURL('image/jpeg', 0.9));
          setFaceShape('');
          setRecommendations([]);
          setHoveredShape('');
          clearOverlay();
          resetOverlayPosition();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      setError('');
      // Camera constraints for 9:16 aspect ratio
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const constraints = { 
        video: { 
          facingMode: 'user', 
          width: { ideal: isMobile ? 720 : 1080 }, 
          height: { ideal: isMobile ? 1280 : 1920 },
          aspectRatio: { ideal: 9/16 },
          frameRate: { ideal: isMobile ? 15 : 30 }
        } 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraReady(true);
        startCameraOverlayLoop();
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please try uploading a photo instead.');
      } else {
      setError('Could not access camera. Please check permissions or try uploading a photo instead.');
      }
    }
  };

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraReady(false);
    clearCameraOverlay();
  };

  const clearCameraOverlay = () => {
    if (cameraOverlayRef.current) {
      const ctx = cameraOverlayRef.current.getContext('2d');
      ctx.clearRect(0, 0, cameraOverlayRef.current.width, cameraOverlayRef.current.height);
    }
  };

  const startCameraOverlayLoop = () => {
    const draw = () => {
      if (!cameraContainerRef.current || !cameraOverlayRef.current) return;
      const box = cameraContainerRef.current.getBoundingClientRect();
      const canvas = cameraOverlayRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = box.width;
      canvas.height = box.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      let baseWidth = canvas.width * 0.62;
      let baseHeight = canvas.height * 0.78;

      const shape = hoveredShapeRef.current || faceShapeRef.current || 'Oval';
      const profile = getShapeProfile(shape);
      const faceWidth = baseWidth * (profile.widthScale || 1.0);
      const faceHeight = baseHeight * (profile.heightScale || 1.0);

      // Draw face shape image overlay - fit within camera view
      const preloadedImg = preloadedImages.current[shape];
      if (preloadedImg) {
        // Use original image dimensions
        const originalWidth = preloadedImg.naturalWidth || preloadedImg.width;
        const originalHeight = preloadedImg.naturalHeight || preloadedImg.height;
        
        // Calculate scale to fit within camera view with proper spacing
        const maxWidth = canvas.width * 0.6; // 60% of canvas width
        const maxHeight = canvas.height * 0.7; // 70% of canvas height
        const spacing = 20; // Spacing from edges
        
        const scaleX = (maxWidth - spacing) / originalWidth;
        const scaleY = (maxHeight - spacing) / originalHeight;
        const maxFitScale = Math.min(scaleX, scaleY); // Maximum scale that fits
        
        // Fixed scale for camera - always 0.6x
        const scaleFactor = 0.6;
        
        // Debug logging
        console.log(`Camera overlay - ${shape}:`, {
          originalSize: `${originalWidth}x${originalHeight}`,
          maxFitScale: maxFitScale.toFixed(2),
          fixedScale: scaleFactor.toFixed(2),
          canvasSize: `${canvas.width}x${canvas.height}`
        });
        
        const overlayWidth = originalWidth * scaleFactor;
        const overlayHeight = originalHeight * scaleFactor;
        
        // Center the image with proper spacing
        const overlayX = centerX - overlayWidth / 2;
        const overlayY = centerY - overlayHeight / 2;
        
        ctx.globalAlpha = 0.8;
        ctx.drawImage(preloadedImg, overlayX, overlayY, overlayWidth, overlayHeight);
        ctx.globalAlpha = 1.0;
      } else {
        // Fallback to drawn outline
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        drawFaceSilhouette(ctx, centerX, centerY, faceWidth, faceHeight, profile.ratios || { forehead: 0.92, cheek: 1.0, jaw: 0.78 }, shape);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  };

  const takePicture = () => {
    if (videoRef.current && cameraCanvasRef.current) {
      const video = videoRef.current;
      const canvas = cameraCanvasRef.current;
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      // Create a temporary canvas for cropping to 9:16
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Set temp canvas to 9:16 aspect ratio
      const targetAspectRatio = 9 / 16;
      let cropWidth, cropHeight, cropX, cropY;
      
      if (width / height > targetAspectRatio) {
        // Video is wider than target ratio, crop width
        cropHeight = height;
        cropWidth = height * targetAspectRatio;
        cropX = (width - cropWidth) / 2;
        cropY = 0;
      } else {
        // Video is taller than target ratio, crop height
        cropWidth = width;
        cropHeight = width / targetAspectRatio;
        cropX = 0;
        cropY = (height - cropHeight) / 2;
      }
      
      // Set temp canvas size to 9:16
      tempCanvas.width = 360; // 9 * 40
      tempCanvas.height = 640; // 16 * 40
      
      // Draw cropped and mirrored image
      tempCtx.save();
      tempCtx.translate(tempCanvas.width, 0);
      tempCtx.scale(-1, 1);
      tempCtx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.restore();
      
      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
      setSelectedImage(dataUrl);
      setRecommendations([]);
      setHoveredShape('');
      clearOverlay();
      stopCamera();
      setActiveTab('upload');
      // If a face shape was pre-selected during camera mode, apply it now
      if (faceShape) {
        handleSelectShape(faceShape);
      }
    }
  };

  const switchToCamera = () => { setActiveTab('camera'); startCamera(); };
  const switchToUpload = () => { setActiveTab('upload'); stopCamera(); };

  // Clear overlay canvas for uploaded image
  const clearOverlay = () => {
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  };

  // Draw face-like silhouette by shape for uploaded image preview
  const drawFaceShapeOverlay = (shape) => {
    if (!imageContainerRef.current || !overlayCanvasRef.current) return;
    const box = imageContainerRef.current.getBoundingClientRect();
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = box.width;
    canvas.height = box.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let baseWidth = canvas.width * 0.62;
    let baseHeight = canvas.height * 0.78;

    const profile = getShapeProfile(shape);
    const faceWidth = baseWidth * (profile.widthScale || 1.0);
    const faceHeight = baseHeight * (profile.heightScale || 1.0);

    // Draw face shape image overlay - fit within image view
    const preloadedImg = preloadedImages.current[shape];
    if (preloadedImg) {
      // Use original image dimensions
      const originalWidth = preloadedImg.naturalWidth || preloadedImg.width;
      const originalHeight = preloadedImg.naturalHeight || preloadedImg.height;
      
      // Calculate scale to fit within image view with proper spacing
      const maxWidth = canvas.width * 0.6; // 60% of canvas width
      const maxHeight = canvas.height * 0.7; // 70% of canvas height
      const spacing = 20; // Spacing from edges
      
      const scaleX = (maxWidth - spacing) / originalWidth;
      const scaleY = (maxHeight - spacing) / originalHeight;
      const maxFitScale = Math.min(scaleX, scaleY); // Maximum scale that fits
      
      // Use user's scale preference - allow going beyond fit if desired
      const scaleFactor = imageScale;
      
      const overlayWidth = originalWidth * scaleFactor;
      const overlayHeight = originalHeight * scaleFactor;
      
      // Center the image with proper spacing and apply position offset
      const overlayX = centerX - overlayWidth / 2 + overlayPosition.x;
      const overlayY = centerY - overlayHeight / 2 + overlayPosition.y;
      
      ctx.globalAlpha = 0.8;
      ctx.drawImage(preloadedImg, overlayX, overlayY, overlayWidth, overlayHeight);
      ctx.globalAlpha = 1.0;

      // Add shape label with scaled font size
      ctx.fillStyle = '#00d4ff';
      const labelFontSize = Math.max(12, Math.min(20, 14 * scaleFactor)); // Responsive font size
      ctx.font = `bold ${labelFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(shape, centerX, centerY + overlayHeight / 2 + 18);
    } else {
      // Fallback to drawn outline
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(0, 212, 255, 0.08)';
      drawFaceSilhouette(ctx, centerX, centerY, faceWidth, faceHeight, profile.ratios || { forehead: 0.92, cheek: 1.0, jaw: 0.78 }, shape);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00d4ff';
    const fallbackLabelFontSize = Math.max(12, Math.min(20, 14 * imageScale)); // Responsive font size
    ctx.font = `bold ${fallbackLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(shape, centerX, centerY + faceHeight / 2 + 18);
    }
  };

  // Hover handlers
  const handleShapeHover = (shape) => { setHoveredShape(shape); };
  const handleShapeLeave = () => { setHoveredShape(''); };

  // Drag handlers for overlay positioning
  const handleMouseDown = (e) => {
    if (!selectedImage) return;
    setIsDragging(true);
    const rect = imageContainerRef.current.getBoundingClientRect();
    setDragStart({
      x: e.clientX - overlayPosition.x,
      y: e.clientY - overlayPosition.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !selectedImage) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setOverlayPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e) => {
    if (!selectedImage) return;
    e.preventDefault();
    setIsDragging(true);
    const rect = imageContainerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    setDragStart({
      x: touch.clientX - overlayPosition.x,
      y: touch.clientY - overlayPosition.y
    });
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !selectedImage) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    setOverlayPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Reset overlay position
  const resetOverlayPosition = () => {
    setOverlayPosition({ x: 0, y: 0 });
  };

  // Open image modal
  const openImageModal = (imageSrc, title) => {
    setSelectedModalImage(imageSrc);
    setSelectedModalTitle(title);
    setShowImageModal(true);
  };

  // Close image modal
  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedModalImage(null);
    setSelectedModalTitle('');
  };

  // Manual selection: user clicks a face shape button
  const handleSelectShape = async (shape) => {
    if (!selectedImage) {
      setError('Please upload or take a photo first');
      return;
    }
    setError('');
    setLoading(true);
    try {
      setFaceShape(shape);
      const haircutRecommendations = getRecommendationsByFaceShape(shape);
      setRecommendations(haircutRecommendations);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('haircut_recommendations')
        .insert([{ 
          customer_id: user?.id,
          face_shape: shape,
          recommended_styles: haircutRecommendations,
          image_url: selectedImage
        }]);
      if (error) throw error;
      fetchPreviousRecommendations();
    } catch (e) {
      console.error('Error saving recommendation:', e);
      setError('Could not save your selection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Haircut images from local assets
  const haircutImages = {
    // Oval - using available images
    'french-crop': frenchCropImg,
    'mullet': shortMulletImg, // Using short-mullet as substitute
    'burst-fade': burstFadeImg,
    'comma-hair': commaHairImg,
    
    // Diamond
    'diamond-crew-cut': diamondCrewCutImg,
    'wolf-cut': wolfCutImg,
    'low-taper': lowTaperImg,
    '70-30-hair': sidePartImg, // Using side-part as substitute
    'fringe': fringeImg,
    
    // Round
    'side-part': sidePartImg,
    'blowout-taper': highFadeImg, // Using high-fade as substitute
    'undercut': undercutImg,
    'slicked-back': warriorImg, // Using warrior as substitute
    'quiffs': quiffsImg,
    
    // Triangle
    'short-mullet': shortMulletImg,
    'edgar': edgarImg,
    'textured-fringe': texturedFringeImg,
    'curtain': curtainImg,
    'low-fade': lowFadeImg,
    
    // Rectangle
    'long-trim': longTrimImg,
    'middle-part': middlePartImg,
    'warrior-buzz-cut': warriorBuzzCutImg,
    'warrior-cut': warriorImg,
    'comma-cut': commaCutImg,
    
    // Oblong
    'modern-spike': modernSpikeImg,
    'slick-back': warriorImg, // Using warrior as substitute
    'buzz-cut': buzzCutImg,
    'high-fade': highFadeImg
  };

  // Updated recommendations with new styles and image support
  const getRecommendationsByFaceShape = (shape) => {
    const baseRecommendations = {
      'Oval': [
        { name: 'French Crop', description: 'Short, textured top with longer fringe that can be styled forward or swept to the side.', suitability: 95, difficulty: 'Low', maintenance: 'Low', tags: ['Modern', 'Versatile', 'Low-maintenance'], image: haircutImages['french-crop'] },
        { name: 'Mullet', description: 'Short on top and sides with longer length at the back. Perfect for adding personality.', suitability: 90, difficulty: 'Medium', maintenance: 'Medium', tags: ['Trendy', 'Bold', 'Statement'], image: haircutImages['mullet'] },
        { name: 'Burst Fade', description: 'Circular fade pattern that creates a burst effect around the ears and neckline.', suitability: 88, difficulty: 'High', maintenance: 'High', tags: ['Modern', 'Precision', 'Stylish'], image: haircutImages['burst-fade'] },
        { name: 'Comma Hair', description: 'Fringe styled to curve like a comma, creating a soft, natural look.', suitability: 85, difficulty: 'Medium', maintenance: 'Medium', tags: ['Natural', 'Soft', 'Elegant'], image: haircutImages['comma-hair'] }
      ],
      'Diamond': [
        { name: 'Diamond Crew Cut', description: 'Classic crew cut that complements the diamond face shape with clean, structured lines.', suitability: 95, difficulty: 'Low', maintenance: 'Low', tags: ['Classic', 'Clean', 'Professional'], image: haircutImages['diamond-crew-cut'] },
        { name: 'Wolf Cut', description: 'Layered cut with shaggy texture that adds volume and movement to balance cheekbones.', suitability: 92, difficulty: 'Medium', maintenance: 'Medium', tags: ['Trendy', 'Textured', 'Voluminous'], image: haircutImages['wolf-cut'] },
        { name: 'Low Taper', description: 'Gradual length reduction from top to bottom, creating a clean, professional look.', suitability: 90, difficulty: 'Low', maintenance: 'Low', tags: ['Professional', 'Clean', 'Versatile'], image: haircutImages['low-taper'] },
        { name: '70/30 Hair', description: 'Asymmetrical part that creates visual balance for diamond face shapes.', suitability: 88, difficulty: 'Medium', maintenance: 'Medium', tags: ['Asymmetrical', 'Balanced', 'Modern'], image: haircutImages['70-30-hair'] },
        { name: 'Fringe', description: 'Straight-across fringe that helps balance the wider cheekbone area.', suitability: 85, difficulty: 'Medium', maintenance: 'High', tags: ['Balancing', 'Soft', 'Youthful'], image: haircutImages['fringe'] }
      ],
      'Round': [
        { name: 'Side Part', description: 'Classic side part that creates vertical lines to elongate the face.', suitability: 95, difficulty: 'Low', maintenance: 'Low', tags: ['Classic', 'Professional', 'Timeless'], image: haircutImages['side-part'] },
        { name: 'Blowout Taper', description: 'Voluminous top with tapered sides that adds height and reduces width.', suitability: 92, difficulty: 'Medium', maintenance: 'Medium', tags: ['Voluminous', 'Modern', 'Stylish'], image: haircutImages['blowout-taper'] },
        { name: 'UnderCut', description: 'Short sides with longer top that creates strong contrast and elongates the face.', suitability: 90, difficulty: 'Low', maintenance: 'Medium', tags: ['Contrast', 'Modern', 'Bold'], image: haircutImages['undercut'] },
        { name: 'Slicked Back', description: 'Hair styled back to create length and sophistication.', suitability: 88, difficulty: 'Medium', maintenance: 'High', tags: ['Sophisticated', 'Formal', 'Elegant'], image: haircutImages['slicked-back'] },
        { name: 'Quiffs', description: 'Textured, voluminous top that adds height and creates vertical emphasis.', suitability: 85, difficulty: 'Medium', maintenance: 'Medium', tags: ['Voluminous', 'Textured', 'Modern'], image: haircutImages['quiffs'] }
      ],
      'Triangle': [
        { name: 'Short Mullet', description: 'Modern take on the mullet with shorter length that adds width to the upper face.', suitability: 95, difficulty: 'Medium', maintenance: 'Medium', tags: ['Modern', 'Balanced', 'Trendy'], image: haircutImages['short-mullet'] },
        { name: 'Edgar', description: 'Sharp, angular cut with defined lines that complements triangular face shapes.', suitability: 92, difficulty: 'High', maintenance: 'High', tags: ['Sharp', 'Angular', 'Precise'], image: haircutImages['edgar'] },
        { name: 'Textured Fringe', description: 'Layered fringe that adds volume to the forehead area.', suitability: 90, difficulty: 'Medium', maintenance: 'Medium', tags: ['Textured', 'Voluminous', 'Modern'], image: haircutImages['textured-fringe'] },
        { name: 'Curtain', description: 'Center-parted fringe that creates width at the forehead.', suitability: 88, difficulty: 'Medium', maintenance: 'Medium', tags: ['Balanced', 'Soft', 'Natural'], image: haircutImages['curtain'] },
        { name: 'Low Fade', description: 'Gradual fade that keeps focus on the top while maintaining clean sides.', suitability: 85, difficulty: 'Low', maintenance: 'Low', tags: ['Clean', 'Professional', 'Versatile'], image: haircutImages['low-fade'] }
      ],
      'Rectangle': [
        { name: 'Long Trim', description: 'Longer length that adds softness to angular features.', suitability: 95, difficulty: 'Low', maintenance: 'Medium', tags: ['Soft', 'Natural', 'Versatile'], image: haircutImages['long-trim'] },
        { name: 'Middle Part', description: 'Center part that creates symmetry and softens strong jawlines.', suitability: 92, difficulty: 'Low', maintenance: 'Low', tags: ['Symmetrical', 'Soft', 'Classic'], image: haircutImages['middle-part'] },
        { name: 'Warrior x Buzz Cut', description: 'Bold, short cut with warrior-inspired styling for a strong look.', suitability: 90, difficulty: 'Low', maintenance: 'Low', tags: ['Bold', 'Strong', 'Minimal'], image: haircutImages['warrior-buzz-cut'] },
        { name: 'Warrior Cut', description: 'Modern interpretation of warrior styling with contemporary elements.', suitability: 88, difficulty: 'Medium', maintenance: 'Medium', tags: ['Modern', 'Bold', 'Contemporary'], image: haircutImages['warrior-cut'] },
        { name: 'Comma Cut', description: 'Curved styling that softens angular features with natural flow.', suitability: 85, difficulty: 'Medium', maintenance: 'Medium', tags: ['Natural', 'Soft', 'Flowing'], image: haircutImages['comma-cut'] }
      ],
      'Oblong': [
        { name: 'Modern Spike', description: 'Textured spikes that add width and create horizontal emphasis.', suitability: 95, difficulty: 'Medium', maintenance: 'Medium', tags: ['Modern', 'Textured', 'Widening'], image: haircutImages['modern-spike'] },
        { name: 'Slick Back', description: 'Hair styled back to create width and sophistication.', suitability: 92, difficulty: 'Medium', maintenance: 'High', tags: ['Sophisticated', 'Widening', 'Elegant'], image: haircutImages['slick-back'] },
        { name: 'Buzz Cut', description: 'Short, uniform length that creates width and reduces length perception.', suitability: 90, difficulty: 'Low', maintenance: 'Low', tags: ['Minimal', 'Clean', 'Low-maintenance'], image: haircutImages['buzz-cut'] },
        { name: 'High Fade', description: 'Fade that starts high to create width and balance length.', suitability: 88, difficulty: 'Medium', maintenance: 'Medium', tags: ['Balanced', 'Modern', 'Precise'], image: haircutImages['high-fade'] }
      ]
    };
    return baseRecommendations[shape] || baseRecommendations['Oval'];
  };

  return (
    <div className="container py-4">
      {/* Header with logo */}
      <div className="row mb-4">
        <div className="col">
          <div className="recommender-header p-3 p-md-4 rounded shadow-sm">
            <div className="d-flex flex-column flex-md-row align-items-center justify-content-between">
              <div className="text-center text-md-start mb-3 mb-md-0">
                <div className="d-flex align-items-center justify-content-center justify-content-md-start mb-2">
                <img src={logoImage} alt="Raf & Rok" className="recommender-logo me-3" height="40" style={{ backgroundColor: '#ffffff', padding: '3px', borderRadius: '5px' }} />
                  <h1 className="h3 h4-md mb-0 text-white">Haircut Recommender</h1>
                </div>
                <p className="text-light mb-0 small"><i className="bi bi-scissors me-2"></i>Simple face shape selection for personalized haircut recommendations</p>
              </div>
              <div>
                <Link to="/dashboard" className="btn btn-light btn-sm"><i className="bi bi-arrow-left me-2"></i>Back to Dashboard</Link>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-md-10 mx-auto">
          <div className={`card shadow-sm mb-4 ${animateItems ? 'card-animated' : ''}`}>
            <div className="card-body p-4">
              {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <div className="d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
                    <div>{error}</div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setError('')}></button>
                </div>
              )}

              <div className="row">
                <div className="col-12 col-md-6">
                  <div className="upload-section mb-4">
                    <div className="mb-4">
                      <div className="d-flex justify-content-center">
                        <div className="btn-group" role="group">
                          <button type="button" className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={switchToUpload}><i className="bi bi-cloud-upload me-2"></i>Upload Photo</button>
                          <button type="button" className={`btn ${activeTab === 'camera' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={switchToCamera}><i className="bi bi-camera me-2"></i>Take Photo</button>
                        </div>
                      </div>
                    </div>

                    {activeTab === 'upload' && (
                      <div>
                        {!selectedImage ? (
                          <div className="border-2 border-dashed border-secondary rounded p-4 text-center">
                            <input type="file" className="d-none" id="photo-upload" accept="image/*" onChange={handleImageUpload} />
                            <label htmlFor="photo-upload" className="cursor-pointer">
                              <div className="mb-3"><i className="bi bi-cloud-arrow-up display-4 text-primary"></i></div>
                              <h5>Drop your photo here</h5>
                              <p className="text-muted">or click to browse</p>
                            </label>
                            <div className="mt-3"><small className="text-info"><i className="bi bi-info-circle me-1"></i>Upload a clear front-facing photo, then manually select your face shape</small></div>
                          </div>
                        ) : (
                          <div className="text-center">
                             <div 
                               ref={imageContainerRef} 
                               className="position-relative d-inline-block mb-3 w-100" 
                               style={{ maxWidth: '360px', aspectRatio: '9 / 16' }}
                               onMouseMove={handleMouseMove}
                               onMouseUp={handleMouseUp}
                               onMouseLeave={handleMouseUp}
                               onTouchMove={handleTouchMove}
                               onTouchEnd={handleTouchEnd}
                             >
                              <img ref={imageRef} src={selectedImage} alt="Uploaded face" className="img-fluid rounded position-absolute top-0 start-0 w-100 h-100" style={{ objectFit: 'contain' }} />
                              {/* Overlay canvas for face shape outlines - now draggable */}
                              <canvas 
                                ref={overlayCanvasRef} 
                                className="position-absolute top-0 start-0 w-100 h-100" 
                                style={{ 
                                  pointerEvents: 'auto',
                                  cursor: isDragging ? 'grabbing' : 'grab'
                                }}
                                onMouseDown={handleMouseDown}
                                onTouchStart={handleTouchStart}
                              />
                              <button className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2" onClick={() => { setSelectedImage(null); setFaceShape(''); setRecommendations([]); setHoveredShape(''); clearOverlay(); resetOverlayPosition(); }}><i className="bi bi-x"></i></button>
                            </div>
                            <div className="mt-3">
                              <h6 className="mb-2">
                                {window.innerWidth < 768 ? 'Tap shapes to see outlines, then tap to select' : 'Hover over shapes to see outlines, then click to select'}
                              </h6>
                              
                               {/* Enhanced Size Adjuster for Upload */}
                               <div className="mb-3 p-3 bg-light rounded">
                                 <div className="d-flex align-items-center justify-content-center mb-2">
                                   <i className="bi bi-zoom-out me-2 text-muted"></i>
                                   <label className="form-label mb-0 fw-bold">Overlay Size: {imageScale.toFixed(1)}x</label>
                                   <i className="bi bi-zoom-in ms-2 text-muted"></i>
                                 </div>
                                 
                                 <div className="d-flex align-items-center justify-content-center gap-3">
                                   <button 
                                     className="btn btn-outline-secondary btn-sm"
                                     onClick={() => setImageScale(Math.max(0.1, imageScale - 0.1))}
                                     disabled={imageScale <= 0.1}
                                   >
                                     <i className="bi bi-dash"></i>
                                   </button>
                                   
                                   <input 
                                     type="range" 
                                     className="form-range" 
                                     min="0.1" 
                                     max="1.5" 
                                     step="0.1" 
                                     value={imageScale} 
                                     onChange={(e) => setImageScale(parseFloat(e.target.value))}
                                     style={{ width: '150px' }}
                                   />
                                   
                                   <button 
                                     className="btn btn-outline-secondary btn-sm"
                                     onClick={() => setImageScale(Math.min(1.5, imageScale + 0.1))}
                                     disabled={imageScale >= 1.5}
                                   >
                                     <i className="bi bi-plus"></i>
                                   </button>
                                 </div>
                                 
                                 <div className="d-flex justify-content-between mt-2">
                                   <small className="text-muted">Small</small>
                                   <small className="text-muted">Large</small>
                                 </div>
                                 
                                 {/* Quick Size Presets */}
                                 <div className="mt-2 d-flex justify-content-center gap-2">
                                   <button 
                                     className="btn btn-outline-primary btn-sm"
                                     onClick={() => setImageScale(0.2)}
                                   >
                                     Small
                                   </button>
                                   <button 
                                     className="btn btn-outline-primary btn-sm"
                                     onClick={() => setImageScale(0.3)}
                                   >
                                     Medium
                                   </button>
                                   <button 
                                     className="btn btn-outline-primary btn-sm"
                                     onClick={() => setImageScale(0.5)}
                                   >
                                     Large
                                   </button>
                                 </div>
                                 
                                 {/* Position Controls */}
                                 <div className="mt-2 d-flex justify-content-center gap-2">
                                   <button 
                                     className="btn btn-outline-secondary btn-sm"
                                     onClick={resetOverlayPosition}
                                     title="Reset overlay position to center"
                                   >
                                     <i className="bi bi-arrow-clockwise me-1"></i>
                                     Reset Position
                                   </button>
                                 </div>
                                 
                                 {/* Drag Instructions */}
                                 <div className="mt-2">
                                   <small className="text-muted">
                                     <i className="bi bi-hand-index me-1"></i>
                                     Drag the overlay to position it on your face
                                   </small>
                                 </div>
                               </div>
                              <div className="d-flex flex-wrap gap-2 justify-content-center">
                                {['Round','Diamond','Oblong','Rectangle','Triangle','Oval'].map(shape => (
                                  <button
                                    key={shape}
                                    type="button"
                                    className={`btn btn-outline-primary ${window.innerWidth < 768 ? 'btn-sm' : 'btn-sm'} ${faceShape === shape ? 'active' : ''} ${hoveredShape === shape ? 'btn-primary' : ''}`}
                                    onClick={() => handleSelectShape(shape)}
                                    onMouseEnter={() => handleShapeHover(shape)}
                                    onMouseLeave={handleShapeLeave}
                                    onTouchStart={() => handleShapeHover(shape)}
                                    onTouchEnd={handleShapeLeave}
                                    disabled={loading}
                                    style={{ minWidth: window.innerWidth < 768 ? '70px' : 'auto' }}
                                  >
                                    <i className={`bi bi-${
                                      shape === 'Round' ? 'circle' :
                                      shape === 'Diamond' ? 'diamond' :
                                      shape === 'Oblong' ? 'rectangle-vertical' :
                                      shape === 'Rectangle' ? 'square' :
                                      shape === 'Triangle' ? 'triangle' :
                                      shape === 'Oval' ? 'egg' :
                                      'circle'
                                    } me-1`}></i>
                                    {shape}
                                  </button>
                                ))}
                              </div>
                              {hoveredShape && (
                            <div className="mt-2 text-info small">
                              <i className="bi bi-eye me-1"></i>
                              {window.innerWidth < 768 ? 'Showing' : 'Showing'} {hoveredShape} face shape outline
                            </div>
                              )}
                              {loading && (
                                <div className="mt-2 text-muted small"><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Applying filter...</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'camera' && (
                      <div className="camera-container">
                         <div ref={cameraContainerRef} className="position-relative mb-3 w-100" style={{ aspectRatio: '9 / 16' }}>
                          <video ref={videoRef} autoPlay playsInline muted className="position-absolute top-0 start-0 w-100 h-100 rounded" style={{ objectFit: 'cover', transform: 'scaleX(-1)' }} />
                          {/* Live face-shape guide overlay */}
                          <canvas ref={cameraOverlayRef} className="position-absolute top-0 start-0 w-100 h-100" style={{ pointerEvents: 'none', transform: 'scaleX(-1)' }} />
                        </div>
                        <div className="text-center">
                          <button className="btn btn-primary btn-lg rounded-circle" onClick={takePicture} disabled={!isCameraReady} style={{ width: '60px', height: '60px' }}><i className="bi bi-camera-fill"></i></button>
                          <div className="mt-2"><small className="text-muted">Align your face to the outline, capture, then select your face shape</small></div>
                        </div>
                        {/* Face shape selection while in camera mode */}
                        <div className="mt-3 text-center">
                          <h6 className="mb-2">Select your face shape to guide the overlay</h6>
                           <div className="mb-3 p-2 bg-light rounded">
                             <small className="text-muted">
                               <i className="bi bi-info-circle me-1"></i>
                               Camera overlay is fixed at 0.3x for optimal alignment. Adjust size after capture.
                             </small>
                           </div>
                          <div className="d-flex flex-wrap gap-2 justify-content-center">
                            {['Round','Diamond','Oblong','Rectangle','Triangle','Oval'].map(shape => (
                              <button
                                key={shape}
                                type="button"
                                className={`btn btn-outline-primary ${window.innerWidth < 768 ? 'btn-sm' : 'btn-sm'} ${faceShape === shape ? 'active' : ''} ${hoveredShape === shape ? 'btn-primary' : ''}`}
                                onClick={() => {
                                  // In camera mode before capture, just set the shape to adjust overlay
                                  setFaceShape(shape);
                                }}
                                onMouseEnter={() => handleShapeHover(shape)}
                                onMouseLeave={handleShapeLeave}
                                onTouchStart={() => handleShapeHover(shape)}
                                onTouchEnd={handleShapeLeave}
                                disabled={loading}
                                style={{ minWidth: window.innerWidth < 768 ? '70px' : 'auto' }}
                              >
                                <i className={`bi bi-${
                                  shape === 'Round' ? 'circle' :
                                  shape === 'Diamond' ? 'diamond' :
                                  shape === 'Oblong' ? 'rectangle-vertical' :
                                  shape === 'Rectangle' ? 'square' :
                                  shape === 'Triangle' ? 'triangle' :
                                  shape === 'Oval' ? 'egg' :
                                  'circle'
                                } me-1`}></i>
                                {shape}
                              </button>
                            ))}
                          </div>
                          {hoveredShape && (
                            <div className="mt-2 text-info small">
                              <i className="bi bi-eye me-1"></i>
                              {window.innerWidth < 768 ? 'Showing' : 'Showing'} {hoveredShape} face shape outline
                            </div>
                          )}
                        </div>
                        <canvas ref={cameraCanvasRef} style={{ display: 'none' }}></canvas>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <div className="recommendations-section">
                    {faceShape && recommendations.length > 0 ? (
                      <div>
                        <h5 className="mb-3"><i className="bi bi-scissors me-2"></i>Recommended Haircuts</h5>
                         <div className="recommendations-list">
                           {recommendations.map((rec, index) => (
                             <div key={index} className="card mb-4 border-0 shadow-lg" style={{ borderRadius: '15px', overflow: 'hidden' }}>
                               <div className="card-body p-0">
                                 <div className="row g-0">
                                   {/* Image on the left */}
                                   <div className="col-4 col-md-4">
                                     <div className="haircut-image-container h-100">
                                       <img 
                                         src={rec.image} 
                                         alt={rec.name}
                                         className="img-fluid w-100 h-100"
                                         style={{ 
                                           width: '80px',
                                           height: '80px',
                                           objectFit: 'cover',
                                           borderRadius: '8px',
                                           cursor: 'pointer',
                                           transition: 'transform 0.2s ease'
                                         }}
                                         onClick={() => openImageModal(rec.image, rec.name)}
                                         onMouseEnter={(e) => {
                                           e.target.style.transform = 'scale(1.05)';
                                         }}
                                         onMouseLeave={(e) => {
                                           e.target.style.transform = 'scale(1)';
                                         }}
                                         onError={(e) => {
                                           e.target.style.display = 'none';
                                           e.target.nextSibling.style.display = 'flex';
                                         }}
                                       />
                                       <div 
                                         className="d-none align-items-center justify-content-center h-100"
                                         style={{ 
                                           width: '80px',
                                           height: '80px',
                                           backgroundColor: '#f8f9fa',
                                           color: '#6c757d',
                                           borderRadius: '8px'
                                         }}
                                       >
                                         <div className="text-center">
                                           <i className="bi bi-scissors display-4 text-primary"></i>
                                           <div className="fw-bold text-dark mt-2">{rec.name}</div>
                                         </div>
                                       </div>
                                       {/* Ranking badge */}
                                       <div className="position-absolute top-0 start-0 m-2">
                                         <span className="badge bg-primary rounded-pill">
                                           #{index + 1}
                                         </span>
                                       </div>
                                     </div>
                                   </div>
                                   {/* Details on the right */}
                                   <div className="col-8 col-md-8">
                                     <div className={`${isMobile ? 'p-2' : 'p-4'} h-100 d-flex flex-column`}>
                                       <div className="d-flex align-items-start justify-content-between mb-2">
                                         <h5 className="fw-bold text-dark mb-0">{rec.name}</h5>
                                         {index === 0 && (
                                           <span className="badge bg-success">
                                             <i className="bi bi-star-fill me-1"></i>
                                             Perfect Match
                                           </span>
                                         )}
                                       </div>
                                       <p className="text-muted mb-3 lh-base">{rec.description}</p>
                                       <div className="row g-2 mb-3">
                                         <div className="col-6">
                                           <div className="d-flex align-items-center">
                                             <i className="bi bi-tools text-warning me-2"></i>
                                             <span className="small fw-medium">Difficulty:</span>
                                           </div>
                                           <div className="mt-1">
                                             <span className={`badge ${rec.difficulty === 'Low' ? 'bg-success' : rec.difficulty === 'Medium' ? 'bg-warning' : 'bg-danger'} small`}>
                                               {rec.difficulty}
                                             </span>
                                           </div>
                                         </div>
                                         <div className="col-6">
                                           <div className="d-flex align-items-center">
                                             <i className="bi bi-clock text-info me-2"></i>
                                             <span className="small fw-medium">Maintenance:</span>
                                           </div>
                                           <div className="mt-1">
                                             <span className={`badge ${rec.maintenance === 'Low' ? 'bg-success' : rec.maintenance === 'Medium' ? 'bg-warning' : 'bg-danger'} small`}>
                                               {rec.maintenance}
                                             </span>
                                           </div>
                                         </div>
                                       </div>
                                       <div className="mb-3">
                                         <div className="small fw-medium mb-2">
                                           <i className="bi bi-tags me-1"></i>
                                           Style Tags:
                                         </div>
                                         <div className="d-flex flex-wrap gap-1">
                                           {rec.tags.map((tag, tagIndex) => (
                                             <span key={tagIndex} className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 small">
                                               {tag}
                                             </span>
                                           ))}
                                         </div>
                                       </div>
                                       <div className="mt-auto">
                                         <Link 
                                           to="/book" 
                                           className="btn btn-primary rounded-pill w-100"
                                           style={{
                                             background: 'linear-gradient(45deg, #007bff, #0056b3)',
                                             border: 'none',
                                             boxShadow: '0 4px 8px rgba(0,123,255,0.3)',
                                             transition: 'all 0.3s ease'
                                           }}
                                           onMouseEnter={(e) => {
                                             e.target.style.transform = 'translateY(-2px)';
                                             e.target.style.boxShadow = '0 6px 12px rgba(0,123,255,0.4)';
                                           }}
                                           onMouseLeave={(e) => {
                                             e.target.style.transform = 'translateY(0)';
                                             e.target.style.boxShadow = '0 4px 8px rgba(0,123,255,0.3)';
                                           }}
                                           onClick={() => {
                                             // Save haircut style to localStorage for booking
                                             const haircutStyle = {
                                               name: rec.name,
                                               description: rec.description,
                                               difficulty: rec.difficulty,
                                               maintenance: rec.maintenance,
                                               tags: rec.tags,
                                               image: rec.image,
                                               faceShape: faceShape,
                                               timestamp: new Date().toISOString(),
                                               // Formatted note for booking
                                               bookingNote: `HAIRCUT RECOMMENDATION:
Style: ${rec.name}
Description: ${rec.description}
Face Shape: ${faceShape}`
                                             };
                                             localStorage.setItem('selectedHaircutStyle', JSON.stringify(haircutStyle));
                                             // Also save directly to special request for easy access
                                             localStorage.setItem('specialRequest', haircutStyle.bookingNote);
                                           }}
                                         >
                                           <i className="bi bi-calendar-plus me-2"></i>
                                           Book This Haircut
                                         </Link>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    ) : (
                      <div className="text-center py-5">
                        <div className="mb-3"><i className="bi bi-scissors display-4 text-muted"></i></div>
                        <h5>No Recommendations Yet</h5>
                        <p className="text-muted">Manually select your face shape using the buttons below the image to see personalized haircut recommendations</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Previous Recommendations */}
          <div className={`card shadow-sm ${animateItems ? 'card-animated' : ''}`} style={{ animationDelay: '0.2s' }}>
            <div className="card-header bg-light">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="bi bi-clock-history me-2"></i>Your Previous Bookings</h5>
                {previousRecommendations.length > 0 && (
                  <div className="d-flex align-items-center">
                    <label className="form-label me-2 mb-0 small">Filter by Face Shape:</label>
                    <select 
                      className="form-select form-select-sm" 
                      style={{ width: 'auto' }}
                      value={selectedFaceShapeFilter}
                      onChange={(e) => setSelectedFaceShapeFilter(e.target.value)}
                    >
                      <option value="all">All Shapes</option>
                      <option value="Oval">Oval</option>
                      <option value="Round">Round</option>
                      <option value="Diamond">Diamond</option>
                      <option value="Oblong">Oblong</option>
                      <option value="Rectangle">Rectangle</option>
                      <option value="Triangle">Triangle</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="card-body">
              {previousRecommendations.length > 0 ? (
                <div className="row">
                  {previousRecommendations
                    .filter(prev => selectedFaceShapeFilter === 'all' || prev.faceShape === selectedFaceShapeFilter)
                    .map((prev) => (
                    <div key={prev.id} className="col-md-6 mb-3">
                      <div className="card border-0 bg-light">
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <div className="d-flex align-items-center">
                              <i className={`bi bi-${prev.faceShape === 'Round' ? 'circle' : prev.faceShape === 'Diamond' ? 'diamond' : prev.faceShape === 'Oblong' ? 'rectangle-vertical' : prev.faceShape === 'Rectangle' ? 'square' : prev.faceShape === 'Triangle' ? 'triangle' : prev.faceShape === 'Oval' ? 'egg' : 'circle'} me-2 text-primary`}></i>
                              <strong>{prev.faceShape}</strong>
                            </div>
                            <small className="text-muted">{new Date(prev.createdAt).toLocaleDateString()}</small>
                          </div>
                          <div className="mb-2">
                            <strong className="text-primary">{prev.style}</strong>
                            <p className="text-muted mb-1 small">{prev.description}</p>
                          </div>
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex flex-column">
                              <small className="text-muted">
                                <i className="bi bi-person me-1"></i>
                                {prev.barberName}
                              </small>
                              <small className="text-muted">
                                <i className="bi bi-calendar me-1"></i>
                                {new Date(prev.appointmentDate).toLocaleDateString()}
                              </small>
                            </div>
                            <Link 
                              to="/book" 
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                // Save haircut style to localStorage for booking
                                const haircutStyle = {
                                  name: prev.style,
                                  description: prev.description,
                                  faceShape: prev.faceShape,
                                  timestamp: new Date().toISOString(),
                                  // Formatted note for booking
                                  bookingNote: `HAIRCUT RECOMMENDATION:
Style: ${prev.style}
Description: ${prev.description}
Face Shape: ${prev.faceShape}`
                                };
                                localStorage.setItem('selectedHaircutStyle', JSON.stringify(haircutStyle));
                                // Also save directly to special request for easy access
                                localStorage.setItem('specialRequest', haircutStyle.bookingNote);
                              }}
                            >
                              <i className="bi bi-calendar-plus me-1"></i>
                              Book Again
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="mb-3"><i className="bi bi-calendar-x display-4 text-muted"></i></div>
                  <h6>No Previous Bookings with Haircut Recommendations</h6>
                  <p className="text-muted mb-0">Book appointments with haircut recommendations to see them here</p>
                </div>
              )}
            </div>
          </div>
         </div>
       </div>

       {/* Image Modal */}
       {showImageModal && (
         <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
           <div className="modal-dialog modal-lg modal-dialog-centered">
             <div className="modal-content">
               <div className="modal-header">
                 <h5 className="modal-title">{selectedModalTitle}</h5>
                 <button 
                   type="button" 
                   className="btn-close" 
                   onClick={closeImageModal}
                   aria-label="Close"
                 ></button>
               </div>
               <div className="modal-body text-center">
                 <img 
                   src={selectedModalImage} 
                   alt={selectedModalTitle}
                   className="img-fluid"
                   style={{ 
                     maxHeight: '70vh',
                     maxWidth: '100%',
                     borderRadius: '8px',
                     boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                   }}
                 />
                 <div className="mt-3 p-3 bg-light rounded">
                   <div className="d-flex align-items-center justify-content-center">
                     <i className="bi bi-camera me-2 text-primary"></i>
                     <small className="text-muted fw-medium">
                       <strong>Note:</strong> If you want this style, take a screenshot to show your barber
                     </small>
                   </div>
                 </div>
               </div>
               <div className="modal-footer">
                 <button 
                   type="button" 
                   className="btn btn-secondary" 
                   onClick={closeImageModal}
                 >
                   Close
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 };
 
 export default HaircutRecommender;