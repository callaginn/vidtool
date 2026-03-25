#!/bin/bash

# Ask for input filename, output filename, and width with defaults
read -p "Enter input filename (default: input.mp4): " input_filename
input_filename=${input_filename:-input.mp4}

read -p "Enter output filename (default: output.mp4): " output_filename
output_filename=${output_filename:-output.mp4}

read -p "Enter width (default: 1280): " width
width=${width:-1280}

# Generate cover image
ffmpeg -i "$input_filename" -vframes 1 -vf scale="$width":-2 -q:v 1 "${output_filename%.mp4}.jpg"

# Generate WebM
ffmpeg -i "$input_filename" -c:v libvpx -qmin 0 -qmax 50 -crf 4 -b:v 1M -vf scale="$width":-2 -an -threads 0 "${output_filename%.mp4}.webm"

# Generate MP4
ffmpeg -i "$input_filename" -c:v libx264 -pix_fmt yuv420p -profile:v baseline -level 3.0 -crf 22 -preset veryslow -vf scale="$width":-2 -an -movflags +faststart -threads 0 "$output_filename"
