import sys
from PIL import Image
import glob

for fname in ['assets/adaptive-icon.jpg', 'assets/icon.jpg', 'assets/logo.jpg', 'assets/splash-icon.jpg']:
    try:
        img = Image.open(fname)
        img.save(fname.replace('.jpg', '.png'), 'PNG')
        print("Converted", fname)
    except Exception as e:
        print("Failed", fname, e)
