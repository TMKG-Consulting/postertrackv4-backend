const ExifParser = require("exif-parser");

const getImageMetadata = (buffer) => {
  let tags = {};

  // EXIF is optional and parsers may throw when an image has no EXIF block
  // or uses a format that exif-parser does not understand.
  try {
    tags = ExifParser.create(buffer).parse().tags || {};
  } catch (_error) {
    tags = {};
  }

  const hasGpsCoordinates =
    Number.isFinite(tags.GPSLatitude) && Number.isFinite(tags.GPSLongitude);
  const captureDate =
    Number.isFinite(tags.DateTimeOriginal) && tags.DateTimeOriginal > 0
      ? tags.DateTimeOriginal
      : null;

  return {
    latitude: hasGpsCoordinates ? tags.GPSLatitude : 0,
    longitude: hasGpsCoordinates ? tags.GPSLongitude : 0,
    captureDate,
  };
};

module.exports = { getImageMetadata };
