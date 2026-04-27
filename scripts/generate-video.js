/**
 * Generates a short cat video from the placeholder cat image using ffmpeg.
 * Creates a subtle "breathing" zoom animation to make it feel alive.
 * Run: node scripts/generate-video.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');
const INPUT_IMAGE = path.join(ASSETS_DIR, 'cat.png');
const OUTPUT_VIDEO = path.join(ASSETS_DIR, 'cat.mp4');

function generate() {
  if (!fs.existsSync(INPUT_IMAGE)) {
    console.error('Error: cat.png not found. Run generate-assets.js first.');
    process.exit(1);
  }

  if (fs.existsSync(OUTPUT_VIDEO)) {
    console.log('cat.mp4 already exists. Deleting to regenerate...');
    fs.unlinkSync(OUTPUT_VIDEO);
  }

  console.log('Generating cat video from placeholder image...');
  console.log('(Replace src/assets/cat.mp4 with a real cat walking video for best results)\n');

  const cmd = [
    'ffmpeg',
    '-y',
    '-loop', '1',
    '-i', INPUT_IMAGE,
    '-c:v', 'libx264',
    '-t', '10',
    '-pix_fmt', 'yuv420p',
    '-vf', [
      // Slow zoom in/out + pan to simulate breathing/movement
      'scale=1920:1080:force_original_aspect_ratio=increase',
      'crop=1920:1080',
      // Zoom in and out slowly
      'zoompan=z=\'if(lte(zoom,1.0),1.15,max(1.0,zoom-0.005))\':d=150:fps=15',
      // Add a gentle sway
      'format=yuv420p'
    ].join(','),
    '-r', '15',
    OUTPUT_VIDEO
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
    const stats = fs.statSync(OUTPUT_VIDEO);
    console.log(`\nCreated: ${OUTPUT_VIDEO}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Duration: 10 seconds (loopable)`);
  } catch (err) {
    console.error('Failed to generate video:', err.message);
    console.log('\nThe app will use the static fallback image instead.');
  }
}

generate();
