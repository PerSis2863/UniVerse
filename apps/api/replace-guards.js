const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

const replaceInFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('ClerkAuthGuard')) {
    content = content.replace(/ClerkAuthGuard/g, 'FirebaseAuthGuard');
    content = content.replace(/clerk-auth\.guard/g, 'firebase-auth.guard');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
};

const walkSync = (dir) => {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walkSync(filePath);
    } else if (filePath.endsWith('.ts')) {
      replaceInFile(filePath);
    }
  });
};

walkSync(directoryPath);
