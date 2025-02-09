const { Storage } = require("@google-cloud/storage");
const path = require("path");

// Initialize Google Cloud Storage with environment-based credentials
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GCLOUD_CLIENT_EMAIL,
    private_key: process.env.GCLOUD_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
});

const bucket = storage.bucket(process.env.GCLOUD_BUCKET_NAME);

// Function to upload to GCS

const uploadToGCS = async (file) => {
  return new Promise((resolve, reject) => {
    const blob = bucket.file(Date.now() + path.extname(file.originalname)); // Create a unique filename
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: file.mimetype, // Ensure the correct content type
    });

    blobStream.on("error", (err) => {
      reject(err);
    });

    blobStream.on("finish", () => {
      blob
        .makePublic()
        .then(() => {
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          resolve(publicUrl);
        })
        .catch((err) => reject(err));
    });

    // Write the file buffer to GCS
    blobStream.end(file.buffer);
  });
};

const uploadGCS = async ({ buffer, filename }) => {
  return new Promise((resolve, reject) => {
    const blob = bucket.file(Date.now() + "-" + filename);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: "image/jpeg",
    });

    blobStream.on("error", (err) => reject(err));
    blobStream.on("finish", async () => {
      try {
        await blob.makePublic();
        resolve(`https://storage.googleapis.com/${bucket.name}/${blob.name}`);
      } catch (err) {
        reject(err);
      }
    });

    blobStream.end(buffer);
  });
};

module.exports = { uploadToGCS, uploadGCS };
