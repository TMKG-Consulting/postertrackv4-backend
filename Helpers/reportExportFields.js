const parseCollection = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const addReportExportFields = (report, imageField) => {
  const imageUrls = Array.isArray(report[imageField]) ? report[imageField] : [];
  const geolocations = parseCollection(report.geolocations);
  const capturedTimestamps = parseCollection(report.capturedTimestamps);
  const dateCaptured =
    capturedTimestamps.find(
      (capture) =>
        typeof capture?.timestamp === "string" &&
        capture.timestamp !== "Not Found" &&
        !Number.isNaN(Date.parse(capture.timestamp))
    )?.timestamp || null;
  let closeShotUrl = null;
  let longShotUrl = null;

  imageUrls.forEach((url, index) => {
    const filename = capturedTimestamps[index]?.filename || "";
    const label = `${filename} ${url}`.toLowerCase();

    if (!closeShotUrl && /close/.test(label)) closeShotUrl = url;
    if (!longShotUrl && /long/.test(label)) longShotUrl = url;
  });

  // Older uploads may not contain shot labels in their filenames. The standard
  // two-photo upload order is close shot first, then long shot.
  if (imageUrls.length === 2) {
    if (!closeShotUrl) {
      closeShotUrl = imageUrls.find((url) => url !== longShotUrl) || imageUrls[0];
    }
    if (!longShotUrl) {
      longShotUrl = imageUrls.find((url) => url !== closeShotUrl) || imageUrls[1];
    }
  }

  return {
    ...report,
    latitude: geolocations[0]?.latitude ?? 0,
    longitude: geolocations[0]?.longitude ?? 0,
    dateCaptured,
    imageUrls,
    closeShotUrl,
    longShotUrl,
  };
};

module.exports = { addReportExportFields };
