const sharp = require("sharp");

// Utility function to apply watermarks

const applyWatermarks = async (buffer, captureDate) => {
  const formattedDate = captureDate
    ? new Date(captureDate * 1000).toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: true,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      })
    : "";

  // Extract image metadata to dynamically position watermarks
  const metadata = await sharp(buffer).metadata();
  const imageWidth = metadata.width || 2048;
  const imageHeight = metadata.height || 1536;

  // Define SVG overlay with improved dynamic positioning
  const svgOverlay = `
      <svg width="${imageWidth}" height="${imageHeight}">
        <text x="40" y="120" font-size="80px" font-weight="bold" fill="red">TMKG PosterTrack IMG</text>
        <text x="${imageWidth - 40}" y="${
    imageHeight - 40
  }" font-size="80px" font-weight="bold" fill="red" text-anchor="end">${formattedDate}</text>
      </svg>
    `;

  return sharp(buffer)
    .composite([
      {
        input: Buffer.from(svgOverlay),
      },
    ])
    .toBuffer();
};

module.exports = { applyWatermarks };
