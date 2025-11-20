const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read all files and directories
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy directories
      copyDir(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const publicDir = path.join(__dirname, 'public');
const distPublicDir = path.join(__dirname, 'dist', 'public');

if (fs.existsSync(publicDir)) {
  console.log('Copying public folder to dist/public...');
  copyDir(publicDir, distPublicDir);
  console.log('✅ Public folder copied successfully!');
} else {
  console.log('⚠️  Public folder not found, skipping copy.');
}

