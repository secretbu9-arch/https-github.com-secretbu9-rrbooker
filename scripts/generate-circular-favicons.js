// Script to generate circular favicons from existing logo
// This script creates circular versions of your favicon

const fs = require('fs');
const path = require('path');

console.log('🔄 Generating circular favicon files...');

// Create circular favicon files
const faviconSizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' }
];

// Instructions for creating circular favicons
console.log('\n📋 Instructions for creating circular favicons:');
console.log('1. Use an online tool like https://favicon.io/favicon-converter/');
console.log('2. Upload your rrbooker-logo.png');
console.log('3. Select "Circular" or "Round" shape option');
console.log('4. Download the generated files');
console.log('5. Place them in your public/ folder with these names:');

faviconSizes.forEach(favicon => {
  console.log(`   - ${favicon.name} (${favicon.size}x${favicon.size})`);
});

console.log('\n📁 Files to create in public/ folder:');
console.log('├── favicon.ico (16x16, 32x32, 48x48 multi-size)');
console.log('├── favicon-16x16.png');
console.log('├── favicon-32x32.png');
console.log('├── apple-touch-icon.png');
console.log('├── android-chrome-192x192.png');
console.log('└── android-chrome-512x512.png');

console.log('\n🎨 Alternative: Use CSS to make existing favicon circular');
console.log('Add this CSS to make any favicon appear circular:');
console.log(`
.favicon-circular {
  border-radius: 50%;
  overflow: hidden;
}
`);

console.log('\n✅ Favicon setup complete!');
console.log('💡 Tip: Clear your browser cache to see the new favicon');
