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
  const formattedDate = Number.isFinite(captureDate)
    ? new Date(captureDate * 1000).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: true,
      })
    : "Not Found";

  const watermarkText = escapeXml(`${formattedDate} | ${city}`);

  // Extract image metadata to dynamically position watermarks
  // Some phone JPEGs contain recoverable scan warnings. Keep processing those
  // images; libvips will still reject data it cannot decode at all.
  const metadata = await sharp(buffer, { failOn: "none" }).metadata();
  const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation);
  const rawWidth = metadata.width || 2048;
  const rawHeight = metadata.height || 1536;
  const imageWidth = swapsDimensions ? rawHeight : rawWidth;
  const imageHeight = swapsDimensions ? rawWidth : rawHeight;
  const dateFontSize = Math.max(
    12,
    Math.min(64, (imageWidth - 48) / Math.max(1, watermarkText.length * 0.6))
  );
  const dateTextWidth = Math.min(
    imageWidth - 48,
    watermarkText.length * dateFontSize * 0.6
  );
  const dateBoxHeight = dateFontSize + 24;
  const dateBoxX = imageWidth - dateTextWidth - 40;
  const dateBoxY = imageHeight - dateBoxHeight - 12;

  // Define SVG overlay with improved dynamic positioning
  const svgOverlay = `
      <svg width="${imageWidth}" height="${imageHeight}">
        <text x="40" y="120" font-size="100px" font-weight="bold" fill="yellow">MediaTrak Audit IMG</text>
        <rect x="${dateBoxX}" y="${dateBoxY}" width="${dateTextWidth + 24}" height="${dateBoxHeight}" fill="black" />
        <text x="${imageWidth - 28}" y="${imageHeight - 24}" font-size="${dateFontSize}px" font-weight="bold" fill="yellow" text-anchor="end">${watermarkText}</text>
      </svg>
    `;

  return sharp(buffer, { failOn: "none" })
    .rotate()
    .composite([
      {
        input: Buffer.from(svgOverlay),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
};

module.exports = { applyWatermarks };
