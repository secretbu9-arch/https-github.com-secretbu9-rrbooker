# Haircut Images Directory

This directory contains images for the haircut recommendations in the HaircutRecommender component.

## Required Images

### Oval Face Shape
- `french-crop.jpg` - French Crop haircut
- `mullet.jpg` - Mullet haircut
- `burst-fade.jpg` - Burst Fade haircut
- `comma-hair.jpg` - Comma Hair haircut

### Diamond Face Shape
- `diamond-crew-cut.jpg` - Diamond Crew Cut
- `wolf-cut.jpg` - Wolf Cut
- `low-taper.jpg` - Low Taper

- `fringe.jpg` - Fringe

### Round Face Shape
- `side-part.jpg` - Side Part
- `blowout-taper.jpg` - Blowout Taper
- `undercut.jpg` - UnderCut
- `slicked-back.jpg` - Slicked Back
- `quiffs.jpg` - Quiffs

### Triangle Face Shape
- `short-mullet.jpg` - Short Mullet
- `edgar.jpg` - Edgar
- `textured-fringe.jpg` - Textured Fringe
- `curtain.jpg` - Curtain
- `low-fade.jpg` - Low Fade

### Rectangle Face Shape
- `long-trim.jpg` - Long Trim
- `middle-part.jpg` - Middle Part
- `warrior-buzz-cut.jpg` - Warrior x Buzz Cut
- `warrior-cut.jpg` - Warrior Cut
- `comma-cut.jpg` - Comma Cut

### Oblong Face Shape
- `modern-spike.jpg` - Modern Spike
- `slick-back.jpg` - Slick Back
- `buzz-cut.jpg` - Buzz Cut
- `high-fade.jpg` - High Fade

## Image Specifications

- **Format:** JPG or PNG
- **Size:** Recommended 400x300px or similar aspect ratio
- **Quality:** High resolution, clear images
- **Style:** Professional haircut photos showing the style clearly
- **Background:** Clean, neutral backgrounds preferred

## Fallback

If an image is not available, the component will show a placeholder with "Image Coming Soon" text and an icon.

## Usage

Images are referenced in the `getRecommendationsByFaceShape` function with paths like:
```javascript
image: '/images/haircuts/french-crop.jpg'
```

Make sure to place the actual image files in the `public/images/haircuts/` directory for them to be accessible.
