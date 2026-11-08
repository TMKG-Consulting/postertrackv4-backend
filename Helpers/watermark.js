const sharp = require("sharp");

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Utility function to apply watermarks

const applyWatermarks = async (buffer, captureDate, city) => {
  // Format the date as "20-Nov-2025 | 9:48:10 AM |"
  const formattedDate = new Date(captureDate * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  });

  const watermarkText = escapeXml(`${formattedDate} | ${city}`);

  // Extract image metadata to dynamically position watermarks
  const metadata = await sharp(buffer).metadata();
  const imageWidth = metadata.width || 2048;
  const imageHeight = metadata.height || 1536;

  // Define SVG overlay with improved dynamic positioning
  const svgOverlay = `
      <svg width="${imageWidth}" height="${imageHeight}">
        <text x="40" y="120" font-size="100px" font-weight="bold" fill="red">MediaTrak Audit IMG</text>
        <text x="${imageWidth - 40}" y="${
    imageHeight - 40
  }" font-size="100px" font-weight="bold" fill="red" text-anchor="end">${watermarkText}</text>
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
